import { LayerData, SubLayerData } from '../types';

// Group features by PA_Name into sub-layers. Returns undefined if all features share one name.
export const buildSubLayers = (
  layerId: string,
  features: any[],
  color: string
): SubLayerData[] | undefined => {
  const paNameGroups: Record<string, any[]> = {};
  for (const feature of features) {
    const paName = feature?.properties?.PA_Name || feature?.properties?.name || 'Unknown';
    if (!paNameGroups[paName]) paNameGroups[paName] = [];
    paNameGroups[paName].push(feature);
  }

  const paNames = Object.keys(paNameGroups);
  if (paNames.length <= 1) return undefined;

  return paNames.map(paName => ({
    id: `${layerId}-${paName}`,
    paName,
    visible: true,
    color,
    geojson: { type: 'FeatureCollection', features: paNameGroups[paName] }
  }));
};

// Build a single LayerData from a combined FeatureCollection (from Storage)
export const buildLayerFromCombinedGeoJSON = (
  featureCollection: any,
  id: string,
  filename: string
): LayerData => {
  const layerId = id || filename.replace(/\.(geo)?json$/i, '') || `layer-${Date.now()}`;
  const layerName = filename || layerId;
  const layerColor = '#3b82f6';

  const features = (featureCollection && featureCollection.type === 'FeatureCollection')
    ? featureCollection.features || []
    : (Array.isArray(featureCollection) ? featureCollection : [featureCollection]);

  const subLayers = buildSubLayers(layerId, features, layerColor);

  return {
    id: layerId,
    name: layerName,
    category: 'Uploaded',
    visible: true,
    color: layerColor,
    geojson: subLayers ? undefined : { type: 'FeatureCollection', features },
    subLayers
  };
};
