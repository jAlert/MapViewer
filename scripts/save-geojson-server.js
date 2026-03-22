#!/usr/bin/env node
// Simple local server to persist uploaded GeoJSON into public/uploads for local commits
import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5002;

app.use(cors());
app.use(express.json({ limit: '200mb' }));

app.post('/save', async (req, res) => {
  try {
    const { fileId, filename, geojson } = req.body;
    if (!fileId || !geojson) return res.status(400).json({ error: 'fileId and geojson required' });

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const filenameSafe = filename ? filename.replace(/[^a-z0-9.-_]/gi, '_') : `${fileId}.geojson`;
    const outPath = path.join(uploadsDir, `${fileId}.geojson`);
    fs.writeFileSync(outPath, JSON.stringify(geojson, null, 2), 'utf8');

    console.log(`Saved GeoJSON ${outPath}`);
    return res.json({ ok: true, path: outPath });
  } catch (err) {
    console.error('Error saving geojson:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.get('/list', async (req, res) => {
  try {
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(uploadsDir)
      .filter(f => f.endsWith('.geojson'))
      .map(filename => {
        const filePath = path.join(uploadsDir, filename);
        const stat = fs.statSync(filePath);
        const fileId = filename.replace('.geojson', '');
        return {
          fileId,
          filename,
          uploadedAt: stat.mtimeMs,
          fileSize: stat.size
        };
      })
      .sort((a, b) => b.uploadedAt - a.uploadedAt);

    return res.json({ files });
  } catch (err) {
    console.error('Error listing files:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.delete('/delete/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) return res.status(400).json({ error: 'fileId required' });

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const outPath = path.join(uploadsDir, `${fileId}.geojson`);
    if (fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
      console.log(`Deleted GeoJSON ${outPath}`);
      return res.json({ ok: true });
    }
    return res.status(404).json({ error: 'file not found' });
  } catch (err) {
    console.error('Error deleting geojson:', err);
    return res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Local GeoJSON save server running on http://0.0.0.0:${PORT}`);
  console.log('Will write files into ./public/uploads/');
});
