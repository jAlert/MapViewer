import React, { useState, useMemo, useEffect } from 'react';
import { Layers, ChevronLeft, ChevronRight, Info, Bot, Map as MapIcon, ZoomIn, ChevronDown, Search } from 'lucide-react';
import { LayerData, MapFeatureProperties } from '../types';
import { isLocalSaveServerAvailable } from '../services/storageService';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  layers: LayerData[];
  onToggleLayer: (id: string) => void;
  onToggleSubLayer?: (layerId: string, subLayerId: string) => void;
  onFocusLayer: (id: string) => void;
  onFocusSubLayer?: (layerId: string, subLayerId: string) => void;
  activeLayerId?: string | null;
  selectedFeature: MapFeatureProperties | null;
  onGenerateInsight: () => void;
  isGeneratingInsight: boolean;
  aiInsight: string | null;
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadError?: string | null;
  uploadSuccess?: string | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  toggleSidebar,
  layers,
  onToggleLayer,
  onToggleSubLayer,
  onFocusLayer,
  onFocusSubLayer,
  activeLayerId,
  selectedFeature,
  onGenerateInsight,
  isGeneratingInsight,
  aiInsight,
  onUpload,
  isUploading,
  uploadError,
  uploadSuccess
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'layers' | 'details'>('layers');
  const [expandedPANames, setExpandedPANames] = useState<Set<string>>(new Set());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxPdfUrl, setLightboxPdfUrl] = useState<string>('');
  const [saveServerAvailable, setSaveServerAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ok = await isLocalSaveServerAvailable();
        if (mounted) setSaveServerAvailable(ok);
      } catch {
        if (mounted) setSaveServerAvailable(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const retrySaveServerCheck = async () => {
    const ok = await isLocalSaveServerAvailable();
    setSaveServerAvailable(ok);
  };

  // Helper to extract Status/Region from subLayer.geojson (reusable)
  const extractProp = (sub: any, prop: string) => {
    if (!sub || !sub.geojson) return undefined;
    const g = sub.geojson;
    if (g.properties && g.properties[prop] !== undefined) return g.properties[prop];
    if (g.type === 'Feature' && g.properties && g.properties[prop] !== undefined) return g.properties[prop];
    if (g.type === 'FeatureCollection' && Array.isArray(g.features) && g.features.length > 0) {
      return g.features[0].properties ? g.features[0].properties[prop] : undefined;
    }
    return undefined;
  };

  // Auto-expand layers when search matches sub-layer names
  React.useEffect(() => {
    if (!searchTerm) return;
    const lower = searchTerm.toLowerCase();
    const toExpand = new Set<string>();
    layers.forEach(l => {
      if (l.subLayers && l.subLayers.some(sl => sl.paName.toLowerCase().includes(lower))) {
        toExpand.add(l.id);
      }
    });
    if (toExpand.size > 0) setExpandedPANames(prev => new Set([...prev, ...Array.from(toExpand)]));
  }, [searchTerm, layers]);

  // Switch to details tab automatically when feature is selected
  React.useEffect(() => {
    if (selectedFeature) {
      setActiveTab('details');
    }
  }, [selectedFeature]);

  const filteredLayers = useMemo(() => {
    const lower = searchTerm.toLowerCase();



    const result = layers
      .map(l => {
        // filter subLayers by search and selected status/region
        const subs = (l.subLayers || []).filter(sl => {
          const matchesSearch = sl.paName.toLowerCase().includes(lower) || l.name.toLowerCase().includes(lower) || l.category.toLowerCase().includes(lower) || !searchTerm;

          const status = extractProp(sl, 'Status') || extractProp(sl, 'status');
          const region = extractProp(sl, 'Region') || extractProp(sl, 'region') || extractProp(sl, 'Reg');

          const matchesStatus = !statusFilter ? true : String(status) === statusFilter;
          const matchesRegion = !regionFilter ? true : String(region) === regionFilter;

          return matchesSearch && matchesStatus && matchesRegion;
        });

        // Decide whether to include this layer: if main layer matches search/filters or any sublayer remains
        const mainMatches = l.name.toLowerCase().includes(lower) || l.category.toLowerCase().includes(lower) || !searchTerm;
        return { ...l, subLayers: subs, include: mainMatches || subs.length > 0 };
      })
      .filter(l => l.include);

    if (searchTerm) {
      console.log(`Search "${searchTerm}" found ${result.length} layers`);
    }

    return result as typeof layers;
  }, [layers, searchTerm, statusFilter, regionFilter]);

  // Auto-toggle visibility to match current filters: select filtered layers/sublayers, deselect others
  React.useEffect(() => {
    if (!onToggleLayer && !onToggleSubLayer) return;

    const lower = searchTerm.toLowerCase();

    layers.forEach(layer => {
      // Determine desired visibility for sublayers
      const desiredSubVis: Record<string, boolean> = {};
      (layer.subLayers || []).forEach(sl => {
        const matchesSearch = sl.paName.toLowerCase().includes(lower) || layer.name.toLowerCase().includes(lower) || layer.category.toLowerCase().includes(lower) || !searchTerm;
        const status = extractProp(sl, 'Status') || extractProp(sl, 'status');
        const region = extractProp(sl, 'Region') || extractProp(sl, 'region') || extractProp(sl, 'Reg');
        const matchesStatus = !statusFilter ? true : String(status) === statusFilter;
        const matchesRegion = !regionFilter ? true : String(region) === regionFilter;
        desiredSubVis[sl.id] = matchesSearch && matchesStatus && matchesRegion;
      });

      // If layer has sublayers, layer should be visible if any sublayer desired
      let desiredLayerVisible = false;
      if (layer.subLayers && layer.subLayers.length > 0) {
        desiredLayerVisible = Object.values(desiredSubVis).some(Boolean);
      } else {
        // No sublayers: decide based on layer name/category matching filters
        const matchesSearch = layer.name.toLowerCase().includes(lower) || layer.category.toLowerCase().includes(lower) || !searchTerm;
        // Try to read status/region from layer.geojson if present
        const status = (layer as any).geojson ? ((layer as any).geojson.properties && (layer as any).geojson.properties.Status) : undefined;
        const region = (layer as any).geojson ? ((layer as any).geojson.properties && ((layer as any).geojson.properties.Region || (layer as any).geojson.properties.Reg)) : undefined;
        const matchesStatus = !statusFilter ? true : String(status) === statusFilter;
        const matchesRegion = !regionFilter ? true : String(region) === regionFilter;
        desiredLayerVisible = matchesSearch && matchesStatus && matchesRegion;
      }

      // Toggle main layer if needed
      if (onToggleLayer && layer.visible !== desiredLayerVisible) {
        onToggleLayer(layer.id);
      }

      // Toggle sublayers if needed
      if (layer.subLayers && onToggleSubLayer) {
        layer.subLayers.forEach(sl => {
          const desired = !!desiredSubVis[sl.id];
          if (sl.visible !== desired) {
            onToggleSubLayer(layer.id, sl.id);
          }
        });
      }
    });

    // Only run auto-toggle when filters/search change — do not run when `layers` updates
    // so manual user toggles are not overridden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, regionFilter, searchTerm]);

  // Group by category
  const categories = useMemo(() => {
    const cats: Record<string, LayerData[]> = {};
    filteredLayers.forEach(l => {
      if (!cats[l.category]) cats[l.category] = [];
      cats[l.category].push(l);
    });
    return cats;
  }, [filteredLayers]);

  const categoryKeys = Object.keys(categories);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  const togglePANameExpanded = (paName: string) => {
    setExpandedPANames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(paName)) {
        newSet.delete(paName);
      } else {
        newSet.add(paName);
      }
      return newSet;
    });
  };

  return (
    <div
      className={`
        fixed left-0 top-0 bottom-0 z-[1000] bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700
        transition-all duration-300 ease-in-out flex flex-col shadow-2xl
        ${isOpen ? 'w-80 translate-x-0' : 'w-80 -translate-x-full'}
      `}
    >
      {/* Toggle Button (Outside when closed, inside logic handled by parent mostly but visual here) */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-10 top-6 bg-white dark:bg-slate-800 p-2 rounded-r-lg shadow-md border-y border-r border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 focus:outline-none"
      >
        {isOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>

      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800 dark:text-gray-100">
          <MapIcon className="text-blue-500" />
          BMB Map Viewer
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Collection of Biodiversity Related Maps</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('layers')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors min-w-max
            ${activeTab === 'layers'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 bg-blue-50/50 dark:bg-slate-800'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
        >
          <Layers size={16} />
        </button>
        <button
          onClick={() => setActiveTab('details')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors min-w-max
            ${activeTab === 'details'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-400 bg-blue-50/50 dark:bg-slate-800'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
        >
          <Info size={16} />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {saveServerAvailable === false && (
          <div className="rounded-md p-3 bg-yellow-50 dark:bg-yellow-700/10 border border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-700 mb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <strong>Local save server unreachable.</strong>
                <div className="text-xs text-gray-500 dark:text-gray-600">GeoJSON save/list features will be disabled. Run <code>npm run save-geojson-server</code> or set <code>VITE_LOCAL_SAVE_URL</code>.</div>
              </div>
              <div className="flex-shrink-0">
                <button onClick={retrySaveServerCheck} className="px-3 py-1 rounded bg-yellow-700 text-white text-sm">Retry</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'layers' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search layers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

              {/* Filters: Status & Region */}
              <div className="flex gap-2 mt-2 items-center">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-1/2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 p-2"
                >
                  <option value="">All Statuses</option>
                  {/* dynamically populate options from layers */}
                  {Array.from(new Set(layers.flatMap(l => (l.subLayers || []).map(sl => {
                    const g = sl.geojson;
                    if (!g) return undefined;
                    if (g.properties && g.properties.Status) return String(g.properties.Status);
                    if (g.type === 'FeatureCollection' && g.features && g.features.length && g.features[0].properties && g.features[0].properties.Status) return String(g.features[0].properties.Status);
                    return undefined;
                  }).filter(Boolean)))).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <select
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  className="w-1/2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 p-2"
                >
                  <option value="">All Regions</option>
                  {Array.from(new Set(layers.flatMap(l => (l.subLayers || []).map(sl => {
                    const g = sl.geojson;
                    if (!g) return undefined;
                    if (g.properties && g.properties.Region) return String(g.properties.Region);
                    if (g.properties && g.properties.Reg) return String(g.properties.Reg);
                    if (g.type === 'FeatureCollection' && g.features && g.features.length && g.features[0].properties) {
                      return g.features[0].properties.Region || g.features[0].properties.Reg;
                    }
                    return undefined;
                  }).filter(Boolean)))).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setStatusFilter('');
                    setRegionFilter('');
                    setSearchTerm('');
                  }}
                  className="ml-2 text-sm px-3 py-2 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  title="Clear filters"
                >
                  Clear
                </button>
              </div>

            {/* Layers List */}
            {categoryKeys.length === 0 ? (
               <div className="text-center py-8 text-gray-400">No layers found</div>
            ) : (
              categoryKeys.map((category) => (
                <div key={category} className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">{category}</h3>
                  <div className="space-y-1">
                    {categories[category].map(layer => (
                      <div key={layer.id} className="space-y-1">
                        {/* Main Layer */}
                        <div
                          onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                            const tgt = e.target as HTMLElement;
                            if (tgt.closest('input')) return; // ignore only checkbox clicks
                            // make sure layer is visible when zooming
                            if (!layer.visible) onToggleLayer(layer.id);
                            onFocusLayer(layer.id);
                          }}
                          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onFocusLayer(layer.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          className={`group flex items-center justify-between p-2 rounded-lg transition-colors ${
                            activeLayerId === layer.id && !layer.subLayers
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600'
                              : 'hover:bg-gray-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <input
                              type="checkbox"
                              checked={layer.visible}
                              onChange={() => onToggleLayer(layer.id)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <div
                              className="w-3 h-3 rounded-full shadow-sm"
                              style={{ backgroundColor: layer.color }}
                            />
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{layer.name}</span>

                            {layer.subLayers && layer.subLayers.length > 0 && (
                              <button
                                onClick={() => togglePANameExpanded(layer.id)}
                                className="ml-auto p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              >
                                <ChevronDown
                                  size={16}
                                  className={`transition-transform ${expandedPANames.has(layer.id) ? 'rotate-180' : ''}`}
                                />
                              </button>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!layer.visible) onToggleLayer(layer.id);
                              onFocusLayer(layer.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-opacity"
                            title="Zoom to Layer"
                          >
                            <ZoomIn size={14} />
                          </button>
                        </div>

                        {/* Sub-layers (PA_Names) - shown when expanded. When searching, only show matching sub-layers unless the main layer matches the search term. */}
                        {layer.subLayers && layer.subLayers.length > 0 && expandedPANames.has(layer.id) && (() => {
                          const lower = searchTerm.toLowerCase();
                          const mainMatches = !searchTerm || layer.name.toLowerCase().includes(lower) || layer.category.toLowerCase().includes(lower);
                          const displayed = mainMatches ? layer.subLayers : layer.subLayers.filter(sl => sl.paName.toLowerCase().includes(lower));
                          if (displayed.length === 0) return null;
                          return (
                            <div className="ml-6 space-y-1">
                              {displayed.map((subLayer) => (
                                <div
                                  key={subLayer.id}
                                  onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                                    const tgt = e.target as HTMLElement;
                                    if (tgt.closest('input')) return;
                                    if (!subLayer.visible && onToggleSubLayer) onToggleSubLayer(layer.id, subLayer.id);
                                    if (onFocusSubLayer) onFocusSubLayer(layer.id, subLayer.id);
                                  }}
                                  onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      if (onFocusSubLayer) onFocusSubLayer(layer.id, subLayer.id);
                                    }
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  className={`group flex items-center justify-between p-2 rounded-lg transition-colors ${
                                    activeLayerId === subLayer.id
                                      ? 'bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600'
                                      : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={subLayer.visible}
                                      onChange={() => {
                                        if (onToggleSubLayer) onToggleSubLayer(layer.id, subLayer.id);
                                      }}
                                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                    <div
                                      className="w-2 h-2 rounded-full shadow-sm"
                                      style={{ backgroundColor: subLayer.color }}
                                    />
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{subLayer.paName}</span>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!subLayer.visible && onToggleSubLayer) onToggleSubLayer(layer.id, subLayer.id);
                                      if (onFocusSubLayer) onFocusSubLayer(layer.id, subLayer.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-opacity"
                                    title="Zoom to PA"
                                  >
                                    <ZoomIn size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'details' && (
          <div className="space-y-6">
            {!selectedFeature ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400 space-y-4">
                <MapIcon size={48} className="opacity-20" />
                <p className="text-sm px-8">Select a polygon on the map to view its details, metadata, and AI insights.</p>
              </div>
            ) : (
              <>
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{selectedFeature.PA_Name}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {selectedFeature.Status}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Region {selectedFeature.Region}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 border border-gray-100 dark:border-slate-700 space-y-3">
                  <div className="space-y-3">
                    {Object.entries(selectedFeature)
                      .filter(([key]) => {
                        // Show only selected fields, exclude specific ones
                        const excludedKeys = ['OBJECTID','Shape_Leng','Shape_Area','NOTES','CRS','Former_Nam','Remarks', 'WDPAID', 'PA_CODE', 'PA_CODE2', 'LegStatCod', 'Reg', 'Region', 'Status', 'PA_Name'];
                        return !excludedKeys.includes(key);
                      })
                      .map(([key, value]) => {
                        // Format the key for display
                        const displayKey = key
                          .replace(/([A-Z])/g, ' $1') // camelCase to words
                          .replace(/^./, str => str.toUpperCase()) // capitalize first letter
                          .trim()
                          .replace('_', ' '); // replace underscores with space

                        // Format the value for display
                        let displayValue: string;
                        if (value === null || value === undefined) {
                          displayValue = 'N/A';
                        } else if (typeof value === 'object') {
                          displayValue = JSON.stringify(value);
                        } else if (typeof value === 'number') {
                          // For numeric values like area, add appropriate unit
                          if (key.toLowerCase().includes('area')) {
                            displayValue = `${value.toFixed(2)} Ha`;
                          } else {
                            displayValue = value.toLocaleString();
                          }
                        } else {
                          displayValue = String(value);
                        }

                        if (key === 'PA_Profile' && !value) {
                          return null;
                        }

                        return (
                          <div key={key} className="flex items-start justify-between py-1.5 border-b border-gray-200 dark:border-slate-700 last:border-b-0">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{displayKey}</p>
                            {key === 'PA_Profile' ? (
                              <button
                                onClick={() => {
                                  if (displayValue) {
                                    setLightboxPdfUrl(displayValue);
                                    setLightboxOpen(true);
                                  }
                                }}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-right max-w-xs underline cursor-pointer transition-colors"
                                title={displayValue}
                              >
                                View Profile
                              </button>
                            ) : (
                              <p className="text-sm text-gray-700 dark:text-gray-200 text-right max-w-xs" title={displayValue}>
                                {displayValue}
                              </p>
                            )}
                          </div>
                        );
                      })
                    }
                  </div>
                </div>

                {/* AI Section */}
                <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-purple-600 dark:text-purple-400">
                      <Bot size={16} /> AI Assistant
                    </h4>
                  </div>

                  {aiInsight ? (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-100 dark:border-purple-800">
                       <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                         {aiInsight}
                       </p>
                       <button
                         onClick={onGenerateInsight}
                         className="mt-3 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 font-medium hover:underline"
                        >
                         Regenerate Insight
                       </button>
                    </div>
                  ) : (
                    <div className="text-center p-6 bg-gray-50 dark:bg-slate-800 rounded-lg border border-dashed border-gray-300 dark:border-slate-600">
                      <p className="text-sm text-gray-500 mb-3">Get detailed analysis about this location using AI.</p>
                      <button
                        onClick={onGenerateInsight}
                        disabled={isGeneratingInsight}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium rounded-lg shadow hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingInsight ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Bot size={16} /> Generate Report
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-slate-700 text-center">
        <a href="#" className="text-xs text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">Documentation</a>
        <span className="mx-2 text-gray-300">|</span>
        <a href="#" className="text-xs text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">Support</a>
      </div>

      {/* PA_Profile PDF Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[15000]"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className={`fixed top-0 left-0 bottom-0 w-screen bg-white dark:bg-slate-800 rounded-lg shadow-2xl flex flex-col border border-gray-200 dark:border-slate-700 transition-all duration-300 ${isOpen ? 'left-0' : 'left-0'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gray-100 dark:bg-slate-900 p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Protected Area Profile</h3>
              <button
                onClick={() => setLightboxOpen(false)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-xl font-bold transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <iframe
                src={`${lightboxPdfUrl}#toolbar=0`}
                className="w-full h-full border-none"
                title="PA Profile PDF"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
