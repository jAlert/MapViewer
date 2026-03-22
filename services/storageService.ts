/**
 * Local-only Storage Service
 * Uses local GeoJSON files as the source of truth.
 * Stores data locally via public/uploads/ directory.
 */

import { buildLayerFromCombinedGeoJSON } from './geojsonBuilder';

interface StoredFileRecord {
  id: string;
  filename: string;
  uploadedAt: number;
  fileType: string;
  fileSize: number;
}

// Determine the local save server base URL.
// Priority: VITE_LOCAL_SAVE_URL env var -> same hostname as the page with port 5002
const envUrl = (import.meta as any).env.VITE_LOCAL_SAVE_URL;
const DEFAULT_SAVE_PORT = '5002';
const deriveLocalSaveBase = () => {
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (typeof window === 'undefined') return `http://localhost:${DEFAULT_SAVE_PORT}`;
  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:${DEFAULT_SAVE_PORT}`;
};
const LOCAL_SAVE_BASE = deriveLocalSaveBase();
const LOCAL_SAVE_URL = `${LOCAL_SAVE_BASE}/save`;

// Create a simple file id
const createFileId = (filename?: string) => {
  const base = filename
    ? filename.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 32)
    : 'file';
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
};

// Fetch GeoJSON file by ID from public/uploads
const fetchGeoJSONFile = async (fileId: string): Promise<any | null> => {
  const possibleUrls = [
    `/uploads/${fileId}.geojson`,
    `${window.location.origin}/uploads/${fileId}.geojson`,
    `/public/uploads/${fileId}.geojson`
  ];
  
  for (const url of possibleUrls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const geojson = await resp.json();
        return geojson;
      }
    } catch (e) {
      continue;
    }
  }
  
  return null;
};

// Get file metadata from GeoJSON file
const getFileMetadataFromGeoJSON = async (fileId: string, geojson: any): Promise<Partial<StoredFileRecord>> => {
  // Try to extract metadata from properties if available
  if (geojson && geojson.properties) {
    return {
      filename: geojson.properties.filename || fileId,
      fileType: geojson.properties.fileType || 'geojson',
      uploadedAt: geojson.properties.uploadedAt || Date.now(),
      fileSize: geojson.properties.fileSize || 0
    };
  }
  return {
    filename: fileId,
    fileType: 'geojson',
    uploadedAt: Date.now(),
    fileSize: 0
  };
};

export const saveUploadedFile = async (
  filename: string,
  fileContent: ArrayBuffer,
  layerData: any,
  fileType: string
): Promise<string> => {
  const fileId = createFileId(filename);
  try {
    // Extract features from layer data
    const features: any[] = [];
    for (const l of layerData || []) {
      if (l.geojson && l.geojson.type === 'FeatureCollection') features.push(...(l.geojson.features || []));
      else if (l.geojson) features.push(l.geojson);
      
      if (l.subLayers && Array.isArray(l.subLayers)) {
        for (const subLayer of l.subLayers) {
          if (subLayer.geojson && subLayer.geojson.type === 'FeatureCollection') {
            features.push(...(subLayer.geojson.features || []));
          } else if (subLayer.geojson) {
            features.push(subLayer.geojson);
          }
        }
      }
    }
    
    const combined = { 
      type: 'FeatureCollection', 
      features,
      properties: {
        filename,
        fileType,
        uploadedAt: Date.now(),
        fileSize: fileContent.byteLength
      }
    };
    
    // Save to local server
    try {
      await fetch(LOCAL_SAVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, filename, geojson: combined })
      });
    } catch (err) {
      console.warn('Local save server not available or failed:', err);
    }

    return fileId;
  } catch (err) {
    console.error('Failed to save uploaded file:', err);
    return createFileId(filename);
  }
};

export const getAllStoredFiles = async (): Promise<(StoredFileRecord & { layerData?: any })[]> => {
  try {
    // Fetch list of files from the local server
    const listUrl = `${LOCAL_SAVE_BASE}/list`;
    const resp = await fetch(listUrl);
    if (!resp.ok) {
      console.warn('Failed to fetch file list from server');
      return [];
    }
    
    const data = await resp.json();
    const files = data.files || [];
    
    // Fetch full content for each file to load layer data
    const records = await Promise.all(
      files.map(async (f: any) => {
        try {
          const geojson = await fetchGeoJSONFile(f.fileId);
          if (geojson) {
            const layer = buildLayerFromCombinedGeoJSON(geojson, f.fileId, f.filename.replace('.geojson', ''));
            return {
              id: f.fileId,
              filename: f.filename.replace('.geojson', ''),
              uploadedAt: f.uploadedAt,
              fileType: 'geojson',
              fileSize: f.fileSize,
              layerData: [layer]
            };
          }
        } catch (err) {
          console.warn(`Failed to load content for file ${f.fileId}:`, err);
        }
        return null;
      })
    );
    
    return records.filter(Boolean) as (StoredFileRecord & { layerData: any })[];
  } catch (err) {
    console.error('Failed to read stored files:', err);
    return [];
  }
};

// Check whether the local save server is reachable
export const isLocalSaveServerAvailable = async (timeoutMs = 3000): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(`${LOCAL_SAVE_BASE}/list`, { method: 'GET', signal: controller.signal });
    clearTimeout(id);
    return resp.ok;
  } catch (err) {
    return false;
  }
};

export const deleteStoredFile = async (id: string): Promise<void> => {
  try {
    // Delete from local server
    try {
      const deleteUrl = `${LOCAL_SAVE_BASE}/delete/${encodeURIComponent(id)}`;
      // Try the server's RESTful delete endpoint first
      try {
        await fetch(deleteUrl, { method: 'DELETE' });
      } catch (e) {
        // Fallback to older query-style delete if server doesn't support the RESTful path
        await fetch(`${LOCAL_SAVE_BASE}?fileId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
    } catch (e) {
      console.warn('Failed to delete from local server:', e);
    }
  } catch (err) {
    console.error('Failed to delete stored file:', err);
    throw err;
  }
};

export const getStorageStats = async () => {
  const files = await getAllStoredFiles();
  const totalSize = files.reduce((s, f) => s + (f.fileSize || 0), 0);
  const byType: Record<string, number> = {};
  files.forEach(f => byType[f.fileType] = (byType[f.fileType] || 0) + 1);
  return { fileCount: files.length, totalSize, byType };
};

export const subscribeToFiles = (
  callback: (files: StoredFileRecord[]) => void,
  errorCallback?: (error: Error) => void
): (() => void) => {
  // No real-time backend; call once and return no-op unsubscribe
  (async () => {
    try {
      const list = await getAllStoredFiles();
      callback(list);
    } catch (err) {
      errorCallback?.(err as Error);
    }
  })();
  return () => {};
};
