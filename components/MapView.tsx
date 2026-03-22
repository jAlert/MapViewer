import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON as LeafletGeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LayerData, MapMode, MapFeatureProperties } from '../types';


// Fix for default Leaflet icon not found in browser environments
// We cannot import images directly in ES modules without a bundler, so we use CDN URLs.
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconShadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: iconUrl,
  shadowUrl: iconShadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Style constants
const STYLES = {
  HIGHLIGHT: { weight: 5, color: '#f59e0b', fillOpacity: 0.7 },
  HOVER: { weight: 3, fillOpacity: 0.7 },
  DEFAULT: (layerColor: string) => ({ color: layerColor, weight: 2, opacity: 1, fillOpacity: 0.3 })
};

interface MapViewProps {
  layers: LayerData[];
  mode: MapMode;
  onFeatureClick: (feature: MapFeatureProperties, layerId: string) => void;
  focusedLayerId: string | null;
  // increments each time a focus request occurs; ensures MapController reacts even
  // when focusedLayerId hasn't changed (e.g. clicking the same layer repeatedly)
  focusCounter: number;
}

// Helper function to compute bounds from layers
const computeBoundsFromLayers = (layers: LayerData[], layerIds?: string[]): L.LatLngBounds[] => {
  const boundsArr: L.LatLngBounds[] = [];

  for (const layer of layers) {
    // Determine whether we should even consider this layer's own geojson
    const includeMain = !layerIds || layerIds.includes(layer.id);

    // If no layer IDs provided we can skip invisible layers; otherwise we always
    // calculate bounds because the caller is explicitly asking for a particular id
    if (!includeMain && !layerIds) continue;
    if (!layer.visible && !layerIds) continue;

    if (layer.geojson && includeMain) {
      try {
        const tmp = L.geoJSON(layer.geojson as any);
        const b = tmp.getBounds();
        if (b && b.isValid()) boundsArr.push(b);
      } catch (err) {
        // ignore individual layer parse errors
      }
    }

    if (layer.subLayers) {
      for (const subLayer of layer.subLayers) {
        // decide whether this sublayer should be included
        const shouldIncludeSubLayer = !layerIds || layerIds.includes(subLayer.id) || includeMain;
        if (!shouldIncludeSubLayer) continue;
        if (!subLayer.visible && !layerIds) continue;
        if (!subLayer.geojson) continue;

        try {
          const tmp = L.geoJSON(subLayer.geojson as any);
          const b = tmp.getBounds();
          if (b && b.isValid()) boundsArr.push(b);
        } catch (err) {
          // ignore
        }
      }
    }
  }

  return boundsArr;
};

// Helper function to merge bounds defensively
const mergeBounds = (boundsArr: L.LatLngBounds[]): L.LatLngBounds | null => {
  if (boundsArr.length === 0) return null;

  let combined = L.latLngBounds([] as any);
  for (const b of boundsArr) {
    try {
      if ((b as any)?.extend && typeof (b as any).extend === 'function') {
        combined.extend(b as any);
      } else {
        combined.extend(L.latLngBounds(b as any));
      }
    } catch (err) {
      try { combined.extend(L.latLngBounds(b as any)); } catch (e) { /* ignore */ }
    }
  }

  return (combined && combined.isValid && combined.isValid()) ? combined : null;
};

const MapController: React.FC<{ layers: LayerData[]; focusedLayerId: string | null; focusCounter: number }> = ({ layers, focusedLayerId, focusCounter }) => {
  const map = useMap();
  const firstRef = React.useRef(true);
  // track the previous focusCounter value so we can ignore layer updates triggered
  // by a deliberate focus action (otherwise auto-fit will zoom back out)
  const lastFocusRef = React.useRef<number>(0);

  // When layers change, ensure map invalidates size and fits to visible layer bounds
  // but skip the fit when the change was caused by a focus request
  useEffect(() => {
    const shouldSkip = lastFocusRef.current !== focusCounter;
    console.log('MapController layers-effect start: focusCounter', focusCounter, 'shouldSkip', shouldSkip);
    lastFocusRef.current = focusCounter;

    // Invalidate size to ensure tiles and layers render correctly
    // Delay slightly to allow DOM updates and TileLayer to initialize
    const t = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (e) {
        // ignore
      }

      if (shouldSkip) {
        // a focus event happened very recently; don't auto-fit to all layers
        console.log('MapController layers-effect skipping auto-fit');
        return;
      }

      const boundsArr = computeBoundsFromLayers(layers);

      if (boundsArr.length > 0) {
        const combined = mergeBounds(boundsArr);
        if (combined) {
          // Only auto-fit on initial load or when the number of layers increases
          if (firstRef.current) {
            map.fitBounds(combined, { padding: [50, 50] });
            firstRef.current = false;
          } else {
            // On subsequent updates, softly pan/zoom if current view is outside bounds
            const current = map.getBounds();
            if (!current.contains(combined)) {
              map.fitBounds(combined, { padding: [50, 50] });
            }
          }
        } else {
          console.warn('MapView: combined bounds invalid, skipping fitBounds', boundsArr);
        }
      }
    }, 150);

    return () => clearTimeout(t);
  }, [layers, map, focusCounter]);

  // Focused layer handling (when user selects a specific layer)
  // whenever focusedLayerId or focusCounter changes, attempt to zoom to that layer
  useEffect(() => {
    if (!focusedLayerId) return;
    console.log('MapController focus-effect:', focusedLayerId, 'counter', focusCounter);

    const boundsArr = computeBoundsFromLayers(layers, [focusedLayerId]);
    console.log('focus bounds arr len', boundsArr.length);
    if (boundsArr.length > 0) {
      const combined = mergeBounds(boundsArr);
      if (combined) {
        map.fitBounds(combined, { padding: [50, 50] });
      } else {
        console.warn('MapView: focused combined bounds invalid for layer, skipping', focusedLayerId, boundsArr);
      }
    }
  }, [focusedLayerId, focusCounter, layers, map]);

  return null;
};

const MapView: React.FC<MapViewProps> = ({ layers, mode, onFeatureClick, focusedLayerId, focusCounter }) => {
  // we need access to the Leaflet map instance for feature‑click zooming
  const mapRef = React.useRef<L.Map | null>(null);

  // Track currently selected feature across re-renders to prevent highlight loss
  const selectedLayerRef = React.useRef<{ layer: L.Path; originalColor: string } | null>(null);

  // Refs to actual rendered L.GeoJSON instances, keyed by layer/sublayer id
  const layerRefs = React.useRef<Map<string, L.GeoJSON>>(new Map());
  const prevFocusedId = React.useRef<string | null>(null);

  // Highlight the focused layer/sub-layer using actual rendered layer refs
  useEffect(() => {
    if (!focusedLayerId) return;

    // Reset the previously highlighted layer back to its original style
    if (prevFocusedId.current && prevFocusedId.current !== focusedLayerId) {
      const prev = layerRefs.current.get(prevFocusedId.current);
      if (prev) {
        let originalColor = '#3b82f6';
        const prevMain = layers.find(l => l.id === prevFocusedId.current);
        if (prevMain) {
          originalColor = prevMain.color;
        } else {
          for (const l of layers) {
            const sub = l.subLayers?.find(sl => sl.id === prevFocusedId.current);
            if (sub) { originalColor = sub.color; break; }
          }
        }
        prev.setStyle(geoJsonStyle(originalColor));
      }
    }

      // Apply highlight to the focused layer
    const geoJsonLayer = layerRefs.current.get(focusedLayerId);
    if (geoJsonLayer) {
      geoJsonLayer.setStyle(STYLES.HIGHLIGHT);
      try { geoJsonLayer.bringToFront(); } catch (e) { /* ignore */ }
      prevFocusedId.current = focusedLayerId;
    }
  }, [focusedLayerId, layers]);

  const tileUrl = useMemo(() => {
    switch (mode) {
      case MapMode.DARK:
        return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      case MapMode.TERRAIN:
        return 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      case MapMode.SATELLITE:
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      case MapMode.LIGHT:
      default:
        return 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    }
  }, [mode]);

  const tileAttribution = useMemo(() => {
    switch (mode) {
        case MapMode.TERRAIN: return 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)';
        case MapMode.SATELLITE: return 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
        default: return '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
    }
  }, [mode]);

  const geoJsonStyle = (layerColor: string) => STYLES.DEFAULT(layerColor);

  // Use 'any' for feature type because GeoJSON namespace is not available in the global scope 
  // and 'GeoJSON' imported from react-leaflet is a component, not a namespace.
  const createOnEachFeature = (layerId: string) => (feature: any, layer: L.Layer) => {
    const layerPath = layer as L.Path;
    const originalColor = feature.properties?.color || '#3b82f6';
    let mouseoutTimeout: NodeJS.Timeout | null = null;

    layer.on({
      click: () => {
        if (feature.properties) {
          // Cancel any pending mouseout
          if (mouseoutTimeout) clearTimeout(mouseoutTimeout);
          
          // Clear previous selection
          if (selectedLayerRef.current && selectedLayerRef.current.layer !== layerPath) {
            selectedLayerRef.current.layer.setStyle(geoJsonStyle(selectedLayerRef.current.originalColor));
          }
          
          // Highlight and store reference, pass layerId to parent
          onFeatureClick(feature.properties as MapFeatureProperties, layerId);
          if (layerPath.setStyle) {
            layerPath.setStyle(STYLES.HIGHLIGHT);
            layerPath.bringToFront();
          }
          selectedLayerRef.current = { layer: layerPath, originalColor };

          // zoom the map to the clicked feature so the user sees exactly what they selected
          const map = mapRef.current;
          if (map) {
            // polygons/multipolygons and even lines should have getBounds()
            // points only have getLatLng(), so handle both cases defensively
            try {
              if ((layerPath as any).getBounds) {
                const b: L.LatLngBounds = (layerPath as any).getBounds();
                if (b && b.isValid()) {
                  map.fitBounds(b, { padding: [50, 50] });
                }
              } else if ((layerPath as any).getLatLng) {
                const p: L.LatLng = (layerPath as any).getLatLng();
                map.setView(p, map.getZoom());
              }
            } catch (e) {
              // ignore any errors computing bounds
            }
          }
        }
      },
      mouseover: () => {
        // Cancel any pending mouseout
        if (mouseoutTimeout) clearTimeout(mouseoutTimeout);
        // Only hover-highlight if NOT selected
        if (selectedLayerRef.current?.layer !== layerPath && layerPath.setStyle) {
          layerPath.setStyle(STYLES.HOVER);
        }
      },
      mouseout: () => {
        // Delay mouseout by 100ms to allow click handler to complete
        mouseoutTimeout = setTimeout(() => {
          // Only reset if NOT selected
          if (selectedLayerRef.current?.layer !== layerPath && layerPath.setStyle) {
            layerPath.setStyle(geoJsonStyle(originalColor));
          }
        }, 100);
      }
    });
  };

  return (
    <MapContainer 
      center={[12.8797, 121.7740]}
      zoom={6}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false} // hide controls per user request
      whenCreated={map => { mapRef.current = map; }}
    >
      <TileLayer
        attribution={tileAttribution}
        url={tileUrl}
      />
      
      {/* Render Uploaded Layers
          Note: render sub-layers independently of the parent's `visible` flag so
          a sub-layer can be shown even if the main layer checkbox is unchecked. */}
      {layers.map(layer => (
        <React.Fragment key={layer.id}>
          {/* Render main layer geojson if present and visible */}
          {layer.visible && layer.geojson && (
            <LeafletGeoJSON
              ref={(r: L.GeoJSON | null) => { if (r) layerRefs.current.set(layer.id, r); else layerRefs.current.delete(layer.id); }}
              data={layer.geojson as any}
              style={() => geoJsonStyle(layer.color)}
              onEachFeature={createOnEachFeature(layer.id)}
            />
          )}

          {/* Render sub-layers if present (render regardless of parent visibility) */}
          {layer.subLayers && layer.subLayers.map(subLayer => (
            subLayer.visible && subLayer.geojson && (
              <LeafletGeoJSON
                key={subLayer.id}
                ref={(r: L.GeoJSON | null) => { if (r) layerRefs.current.set(subLayer.id, r); else layerRefs.current.delete(subLayer.id); }}
                data={subLayer.geojson as any}
                style={() => geoJsonStyle(subLayer.color)}
                onEachFeature={createOnEachFeature(subLayer.id)}
              />
            )
          ))}
        </React.Fragment>
      ))}

      <MapController layers={layers} focusedLayerId={focusedLayerId} focusCounter={focusCounter} />
    </MapContainer>
  );
};

export default MapView;