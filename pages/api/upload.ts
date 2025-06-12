// pages/api/upload.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm } from 'formidable';
import { readFile } from 'fs/promises';
import FormData from 'form-data';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: false,
  },
};

const SHOP = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const POLL_ATTEMPTS = parseInt(process.env.POLL_ATTEMPTS || '30', 10);

function getShopifyContentType(mimetype: string): 'VIDEO' | 'IMAGE' | 'FILE' {
  if (mimetype.startsWith('video/')) return 'VIDEO';
  if (mimetype.startsWith('image/')) return 'IMAGE';
  return 'FILE'; // PDFs, ZIPs, etc.
}

async function callAdmin(query: string, variables?: any) {
  const res = await fetch(`https://${SHOP}/admin/api/2025-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await res.json();
  if (result.errors?.length) {
    console.error('❌ GraphQL errors:', result.errors);
    throw new Error(JSON.stringify(result.errors));
  }
  return result.data;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const form = new IncomingForm({ keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        console.error('❌ Form parse error:', err);
        return res.status(500).json({ error: 'Error parsing form data' });
      }

      const fileRaw = files.file;
      const file = Array.isArray(fileRaw) ? fileRaw[0] : fileRaw;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const buffer = await readFile(file.filepath);
      const { originalFilename, mimetype, size } = file;
      const contentType = getShopifyContentType(mimetype);

      // Step 1: Get staged upload target from Shopify
      const stagedQuery = `
        mutation($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets { url resourceUrl parameters { name value } }
            userErrors { field message }
          }
        }
      `;

      const stagedVars = {
        input: [{
          filename: originalFilename,
          mimeType: mimetype,
          httpMethod: 'POST',
          resource: contentType,
          fileSize: size.toString(),
        }],
      };

      const { stagedUploadsCreate } = await callAdmin(stagedQuery, stagedVars);
      if (stagedUploadsCreate.userErrors.length) {
        console.error('❌ stagedUploadsCreate error:', stagedUploadsCreate.userErrors);
        return res.status(422).json({ error: 'Failed to stage upload', details: stagedUploadsCreate.userErrors });
      }

      const target = stagedUploadsCreate.stagedTargets[0];
      const uploadForm = new FormData();
      target.parameters.forEach((p: any) => uploadForm.append(p.name, p.value));
      uploadForm.append('file', buffer, {
        filename: originalFilename,
        contentType: mimetype,
      });

      const uploadRes = await fetch(target.url, {
        method: 'POST',
        body: uploadForm,
        headers: uploadForm.getHeaders(),
      });

      if (!uploadRes.ok) {
        const responseText = await uploadRes.text();
        console.error('❌ Shopify upload failed:', responseText);
        return res.status(500).json({ error: 'Upload to Shopify failed', details: responseText });
      }

      // Step 2: Create file on Shopify
      const uploadedUrl = target.resourceUrl;
      const uploadedExt = uploadedUrl.split('.').pop()?.split('?')[0];
      const safeFilename = originalFilename?.endsWith(uploadedExt!)
        ? originalFilename
        : `file.${uploadedExt}`;

      const fileCreateQuery = `
        mutation($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              __typename
              ... on GenericFile { id url }
              ... on MediaImage  { id image { url } }
              ... on Video       { id sources { url format } }
            }
            userErrors { field message }
          }
        }
      `;

      const fileCreateVars = {
        files: [{
          originalSource: uploadedUrl,
          filename: safeFilename,
          contentType: contentType,
        }],
      };

      const { fileCreate } = await callAdmin(fileCreateQuery, fileCreateVars);
      if (fileCreate.userErrors.length) {
        console.error('❌ fileCreate error:', fileCreate.userErrors);
        return res.status(422).json({ error: 'Failed to create file', details: fileCreate.userErrors });
      }

      const created = fileCreate.files[0];

      // Step 3: Poll for READY status
      const pollQuery = `
        query($id: ID!) {
          node(id: $id) {
            __typename
            ... on GenericFile {
              fileStatus
              url
            }
            ... on MediaImage {
              fileStatus
              image { url }
            }
            ... on Video {
              fileStatus
              sources { url format }
            }
          }
        }
      `;

      let finalUrl = null;
      let lastStatus = null;

      for (let i = 0; i < POLL_ATTEMPTS; i++) {
        const { node } = await callAdmin(pollQuery, { id: created.id });
        if (!node) break;

        lastStatus = node.fileStatus;

        if (lastStatus === 'READY') {
          if (node.__typename === 'GenericFile') finalUrl = node.url;
          else if (node.__typename === 'MediaImage') finalUrl = node.image?.url;
          else if (node.__typename === 'Video') finalUrl = node.sources?.[0]?.url;
          if (finalUrl) break;
        }

        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!finalUrl) {
        console.error('🕒 File did not become READY. Last status:', lastStatus);
        return res.status(500).json({ error: 'File did not become READY', status: lastStatus });
      }

      return res.status(200).json({ url: finalUrl });

    } catch (error: any) {
      console.error('❌ Upload error:', error);
      return res.status(500).json({ error: error.message || 'Unknown error' });
    }
  });
}
