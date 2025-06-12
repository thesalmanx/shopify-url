import { useState } from 'react';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data.url);
      } else {
        setError(data.error || 'Unknown upload error');
        console.error('❌ Upload failed:', data);
      }
    } catch (err: any) {
      console.error('❌ Request error:', err);
      setError(err.message || 'Upload request failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px' }}>📤 Upload to Shopify</h1>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        disabled={uploading}
      />

      <br /><br />

      <button
        onClick={handleUpload}
        disabled={uploading || !file}
        style={{
          padding: '10px 20px',
          cursor: uploading ? 'not-allowed' : 'pointer',
          backgroundColor: uploading ? '#ccc' : '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
        }}
      >
        {uploading ? 'Uploading...' : 'Upload'}
      </button>

      <br /><br />

      {error && (
        <div style={{ color: 'red' }}>
          ❌ {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '20px' }}>
          ✅ File uploaded: <br />
          <a href={result} target="_blank" rel="noopener noreferrer">{result}</a>
        </div>
      )}
    </div>
  );
}
