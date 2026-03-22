export interface LayerData {
  id: string;
  name: string;
  category: string;
  visible: boolean;
  color: string;
  geojson: any; // Using any for flexible GeoJSON input
  subLayers?: SubLayerData[]; // Optional sub-layers grouped by PA_Name
}

export interface SubLayerData {
  id: string;
  paName: string; // Grouped by PA_Name
  visible: boolean;
  color: string;
  geojson: any; // Individual feature or feature collection
}

export interface MapFeatureProperties {
  id: string;
  name: string;
  type: string;
  area: number;
  description: string;
  [key: string]: any;
}

export enum MapMode {
  LIGHT = 'light',
  DARK = 'dark',
  SATELLITE = 'satellite',
  TERRAIN = 'terrain'
}

export interface StoredFile {
  id: string;
  filename: string;
  layerData?: LayerData[];
  uploadedAt: number;
  fileType: string;
  fileSize: number;
}