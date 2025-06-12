import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

const handleUpload = async () => {
  if (!file) return;
  setUploading(true);
  setError(null);
  setResultUrl(null);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('https://express-shopify.onrender.com/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      setResultUrl(data.url);
    } else {
      setError(data.error || 'Upload failed');
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      setError(err.message);
    } else {
      setError('Something went wrong');
    }
  } finally {
    setUploading(false);
  }
};


  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>📤 Upload to Shopify</h1>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        disabled={uploading}
      />

      <br /><br />

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        style={{
          padding: '10px 20px',
          backgroundColor: uploading ? '#999' : '#0070f3',
          color: '#fff',
          border: 'none',
          borderRadius: '5px',
          cursor: uploading ? 'not-allowed' : 'pointer',
        }}
      >
        {uploading ? 'Uploading...' : 'Upload'}
      </button>

      <br /><br />

      {error && <div style={{ color: 'red' }}>❌ {error}</div>}

      {resultUrl && (
        <div style={{ color: 'green' }}>
          ✅ Uploaded successfully: <br />
          <a href={resultUrl} target="_blank" rel="noopener noreferrer">
            {resultUrl}
          </a>
        </div>
      )}
    </main>
  );
}
