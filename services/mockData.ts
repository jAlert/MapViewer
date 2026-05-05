import { LayerData } from "../types";
import { saveUploadedFile } from "./storageService";
import { buildSubLayers } from "./geojsonBuilder";


// Helper to parse KML to GeoJSON
const kmlToGeoJSON = async (kmlString: string): Promise<any> => {
  try {
    const toGeoJSON = (await import('@mapbox/togeojson')).default;
    const parser = new DOMParser();
    const kmlDom = parser.parseFromString(kmlString, 'text/xml');
    return toGeoJSON.kml(kmlDom);
  } catch (error) {
    console.error('Error parsing KML:', error);
    return null;
  }
};

// Note: shapefile parsing will use `shpjs` for zipped shapefiles in-browser.

// Helper to extract GeoJSON from uploaded zip file data
export const loadLayersFromZip = async (zipFile: File): Promise<LayerData[]> => {
  try {
    // Use JSZip to extract files from the zip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(zipFile);
    
    const layers: LayerData[] = [];
    const filePromises: Promise<void>[] = [];

    // Try to detect a zipped shapefile and parse it directly with `shpjs` (works well in-browser)
    const fileNames = Object.keys(loadedZip.files).map(n => n.toLowerCase());
    const hasShp = fileNames.some(n => n.endsWith('.shp'));
    const hasDbf = fileNames.some(n => n.endsWith('.dbf'));
    // Do not call shpjs on the full File/Blob directly (shpjs expects specific inputs).
    // We'll always parse per-group by assembling small zips of .shp/.dbf/.prj so shpjs receives the correct input.
    let skipShapefileGrouping = false;
    
    // Group shapefile components by base name
    const shapefileGroups: Record<string, { shp?: ArrayBuffer; dbf?: ArrayBuffer; prj?: string }> = {};
    
    // First pass: identify all files
    loadedZip.forEach((relativePath, file) => {
      const ext = relativePath.toLowerCase().split('.').pop();
      if (ext === 'geojson' || ext === 'json') {
        // GeoJSON files
        const promise = file.async('string').then(fileContent => {
          parseGeoJSON(fileContent, relativePath, layers);
        });
        filePromises.push(promise);
      } else if (ext === 'kml') {
        // KML files
        const promise = file.async('string').then(async fileContent => {
          const geojson = await kmlToGeoJSON(fileContent);
          if (geojson) {
            parseGeoJSON(JSON.stringify(geojson), relativePath, layers);
          }
        });
        filePromises.push(promise);
      } else if (ext === 'shp' || ext === 'dbf' || ext === 'prj') {
        if (!skipShapefileGrouping) {
          // Shapefile components (only used if shpjs wasn't able to parse the full zip)
          const baseName = relativePath.split('/').pop()?.split('.')[0] || 'shapefile';
          if (!shapefileGroups[baseName]) {
            shapefileGroups[baseName] = {};
          }
          
          const promise = file.async('arraybuffer').then(buffer => {
            if (ext === 'shp') shapefileGroups[baseName].shp = buffer;
            else if (ext === 'dbf') shapefileGroups[baseName].dbf = buffer;
            else if (ext === 'prj') {
              // Store prj as text for reference
              const view = new Uint8Array(buffer);
              const decoder = new TextDecoder();
              shapefileGroups[baseName].prj = decoder.decode(view);
            }
          });
          filePromises.push(promise);
        }
      }
    });
    
    // Wait for all file reads
    await Promise.all(filePromises);
    
    // If shpjs didn't parse the full zip earlier, try assembling per-shapefile zips
    const shapefileKeys = Object.keys(shapefileGroups);
    let shpjsImported = false;
    if (shapefileKeys.length > 0) {
      try {
        // @ts-ignore - dynamic import of shpjs (may not have types)
        const shpjsModule = (await import('shpjs')) as any;
        const shpParser = shpjsModule.default || shpjsModule;
        shpjsImported = true;

        // For each grouped shapefile, if shp+dbf present, create a small zip and parse
        for (const baseName of shapefileKeys) {
          const comp = shapefileGroups[baseName];
          if (comp.shp) {
            try {
              // Create a zip containing the shapefile components so shpjs can parse them.
              // If .dbf is missing we still attempt parsing (attributes may be lost).
              const JSZip = (await import('jszip')).default;
              const tempZip = new JSZip();
              tempZip.file(`${baseName}.shp`, comp.shp);
              if (comp.dbf) tempZip.file(`${baseName}.dbf`, comp.dbf);
              if (comp.prj) tempZip.file(`${baseName}.prj`, comp.prj);
              const arrayBuffer = await tempZip.generateAsync({ type: 'arraybuffer' });

              const geojson = await shpParser(arrayBuffer as any);
              if (geojson) {
                if (geojson.type === 'FeatureCollection') {
                  parseGeoJSON(JSON.stringify(geojson), baseName, layers);
                } else if (Array.isArray(geojson)) {
                  parseGeoJSON(JSON.stringify({ type: 'FeatureCollection', features: geojson }), baseName, layers);
                }
              } else {
                console.warn(`shpjs returned no features for group ${baseName}.`);
              }
              if (!comp.dbf) {
                console.warn(`Shapefile group ${baseName} is missing a .dbf file — attribute data may be unavailable.`);
              }
            } catch (inner) {
              console.error(`Failed to parse shapefile group ${baseName} with shpjs:`, inner);
            }
          }
        }
      } catch (err) {
        console.error('shpjs not available or failed to import or parse groups:', err);
      }
    }

    console.log(`Parsed layers count: ${layers.length}`);
    if (layers.length === 0) {
      const fileNames = Object.keys(loadedZip.files);
      const msg = `No valid files found in the ZIP. Detected entries: ${JSON.stringify(fileNames)}. Shapefile groups: ${JSON.stringify(shapefileKeys)}. shpjsImported: ${shpjsImported}`;
      console.error(msg);
      throw new Error(msg);
    }

    // Save uploaded file and its parsed data to persistent storage
    try {
      const zipBuffer = await zipFile.arrayBuffer();
      const fileType = hasShp ? 'shapefile' : 'geojson'; // Simplified type detection
      await saveUploadedFile(zipFile.name, zipBuffer, layers, fileType);
    } catch (storageError) {
      console.warn('Failed to save file to persistent storage:', storageError);
      // Continue even if storage fails; layers are still in memory
    }

    return layers;
  } catch (error) {
    console.error('Error loading zip file:', error);
    throw error instanceof Error ? error : new Error('Error loading zip file');
  }
};

// Helper function to parse and create LayerData from GeoJSON
const parseGeoJSON = (fileContent: string, relativePath: string, layers: LayerData[]): void => {
  try {
    const geojsonData = JSON.parse(fileContent);
    
    // Extract layer metadata from filename or GeoJSON properties
    const baseName = relativePath.split('/').pop()?.replace(/\.(geo)?json$|\.kml$/, '') || 'layer';
    const layerId = `${baseName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const layerName = geojsonData.name || baseName;
    const layerCategory = geojsonData.category || 'Protected Areas';
    const layerColor = geojsonData.color || '#3b82f6';
    
    // Convert to FeatureCollection if needed
    const featureCollection = geojsonData.type === 'FeatureCollection' 
      ? geojsonData 
      : { type: 'FeatureCollection', features: [geojsonData] };
    
    const features = featureCollection.features || [];
    const subLayers = buildSubLayers(layerId, features, layerColor);
    if (subLayers) {
      console.log(`✓ Created ${subLayers.length} sub-layers for layer: ${layerName}`);
    }
    
    // Create main layer with either combined geojson or empty if using sub-layers
    const layer: LayerData = {
      id: layerId,
      name: layerName,
      category: layerCategory,
      visible: true,
      color: layerColor,
      geojson: subLayers ? undefined : featureCollection, // If using sub-layers, don't store combined geojson
      subLayers
    };
    
    layers.push(layer);
  } catch (parseError) {
    console.error(`Failed to parse ${relativePath}:`, parseError);
  }
};

