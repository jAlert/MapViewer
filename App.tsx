import React, { useState, useEffect } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import { Layers, Maximize2, Minimize2, Sun, Moon, Mountain, Globe } from 'lucide-react';
import { LayerData, MapMode, MapFeatureProperties } from './types';
import { loadLayersFromZip } from './services/mockData';
import { getAllStoredFiles } from './services/storageService';
import { generateLocationInsight } from './services/geminiService';

function App() {
  // Application State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [mapMode, setMapMode] = useState<MapMode>(MapMode.LIGHT);
  const [selectedFeature, setSelectedFeature] = useState<MapFeatureProperties | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [focusedLayerId, setFocusedLayerId] = useState<string | null>(null);
  // counter to force re‑zoom even when the same layer ID is selected repeatedly
  const [focusCounter, setFocusCounter] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // AI State
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadedFileHashes, setUploadedFileHashes] = useState<Set<string>>(new Set());

  // Handlers
  const toggleLayer = (id: string) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l;
      const newVisible = !l.visible;
      // If toggling main layer, cascade visibility to subLayers
      if (l.subLayers && Array.isArray(l.subLayers)) {
        return {
          ...l,
          visible: newVisible,
          subLayers: l.subLayers.map(sl => ({ ...sl, visible: newVisible }))
        };
      }
      return { ...l, visible: newVisible };
    }));
  };

  const handleFocusLayer = (id: string) => {
    console.log('handleFocusLayer called for', id);
    // ensure layer is visible before focusing
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: true, subLayers: l.subLayers?.map(sl => ({ ...sl, visible: true })) || [] } : l));
    setFocusedLayerId(id);
    setFocusCounter(c => c + 1);
  };

  const handleFeatureClick = (feature: MapFeatureProperties, layerId: string) => {
    setSelectedFeature(feature);
    setActiveLayerId(layerId);
    setAiInsight(null); // Reset AI insight when new feature selected
    if (!isSidebarOpen) setIsSidebarOpen(true);
    // also zoom to the layer so the user can see context around the selected feature
    handleFocusLayer(layerId);
  };

  // Toggle visibility of a sub-layer (identified by subLayerId) inside a parent layer
  const toggleSubLayerVisibility = (layerId: string, subLayerId: string) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId || !l.subLayers) return l;
      return {
        ...l,
        subLayers: l.subLayers.map(sl => sl.id === subLayerId ? { ...sl, visible: !sl.visible } : sl)
      };
    }));
  };

  // Focus (zoom) to a sub-layer by id
  const focusSubLayer = (layerId: string, subLayerId: string) => {
    console.log('focusSubLayer called for', layerId, subLayerId);
    // make sub-layer visible then request focus
    setLayers(prev => prev.map(l => {
      if (l.id !== layerId || !l.subLayers) return l;
      return {
        ...l,
        subLayers: l.subLayers.map(sl => sl.id === subLayerId ? { ...sl, visible: true } : sl)
      };
    }));
    setFocusedLayerId(subLayerId);
    setFocusCounter(c => c + 1);
  };

  const handleGenerateInsight = async () => {
    if (!selectedFeature) return;
    setIsGeneratingInsight(true);
    const insight = await generateLocationInsight(selectedFeature);
    setAiInsight(insight);
    setIsGeneratingInsight(false);
  };

  const handleUpload = async (file: File) => {
    setUploadError(null);
    
    if (!file.name.endsWith('.zip')) {
      setUploadError('Please upload a ZIP file (.zip)');
      return;
    }

    // Compute a simple file signature (name + size) to avoid duplicate uploads
    const fileSignature = `${file.name}:${file.size}`;
    if (uploadedFileHashes.has(fileSignature)) {
      setUploadError('This ZIP file has already been uploaded. To reload it, use the Files tab.');
      return;
    }
    
    setIsUploading(true);
    try {
      const uploadedLayers = await loadLayersFromZip(file);
      
      if (uploadedLayers.length === 0) {
        setUploadError('No valid files found in the ZIP. Supported formats: ESRI Shapefile (.shp/.dbf/.prj), GeoJSON (.json/.geojson), or KML (.kml)');
        setIsUploading(false);
        return;
      }

      setLayers(prev => [...prev, ...uploadedLayers]);
      setUploadSuccess(`✓ Successfully loaded ${uploadedLayers.length} layer(s) from ${file.name}`);
      setUploadError(null);
      // Auto-clear success message after 5 seconds
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload file. Please check the file format.';
      setUploadError(errorMessage);
      console.error('Error uploading file:', error);
    } finally {
      setIsUploading(false);
    }
  };

  // Load locally persisted layers (from IndexedDB) and append them on app start
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await getAllStoredFiles();
        const localLayers = stored.flatMap(f => (f.layerData && Array.isArray(f.layerData)) ? f.layerData : []);
        if (mounted && localLayers.length > 0) {
          setLayers(prev => {
            const existingIds = new Set(prev.map(l => l.id));
            const toAdd = localLayers.filter(l => !existingIds.has(l.id));
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
          });
        }
      } catch (err) {
        console.warn('Failed to load persisted local layers:', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Handler when user selects a stored file in FileManager
  const handleLoadStoredFile = (file: any) => {
    if (!file) return;
    if (file.layerData && Array.isArray(file.layerData) && file.layerData.length > 0) {
      setLayers(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const toAdd = file.layerData.filter((l: LayerData) => !existingIds.has(l.id));
        if (toAdd.length === 0) return prev;
        return [...prev, ...toAdd];
      });
    } else {
      alert('This stored file does not include persisted layer data. Please re-upload the file to load layers.');
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Toggle App Theme (Tailwind Dark Mode)
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      setMapMode(MapMode.DARK);
    } else {
      document.documentElement.classList.remove('dark');
      setMapMode(MapMode.LIGHT);
    }
  }, [isDarkMode]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-100 dark:bg-slate-900 font-sans text-gray-900 dark:text-gray-100">
      
      {/* Sidebar */}
      <Sidebar 
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        layers={layers}
        onToggleLayer={toggleLayer}
        onToggleSubLayer={toggleSubLayerVisibility}
        onFocusLayer={handleFocusLayer}
        onFocusSubLayer={focusSubLayer}
        onFileSelect={handleLoadStoredFile}
        activeLayerId={activeLayerId}
        selectedFeature={selectedFeature}
        onGenerateInsight={handleGenerateInsight}
        isGeneratingInsight={isGeneratingInsight}
        aiInsight={aiInsight}
        onUpload={handleUpload}
        isUploading={isUploading}
        uploadError={uploadError}
        uploadSuccess={uploadSuccess}
      />

      {/* Main Map Container */}
      <main className={`h-full transition-all duration-300 ${isSidebarOpen ? 'ml-80' : 'ml-0'}`}>
        
        {/* Map View */}
        <div className="w-full h-full relative z-0">
          <MapView 
            layers={layers}
            mode={mapMode}
            onFeatureClick={handleFeatureClick}
            focusedLayerId={focusedLayerId}
            focusCounter={focusCounter}
          />

          {/* Floating Controls */}
          <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2">
            
            {/* Mode Toggles */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 p-1 flex flex-col">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md transition-colors text-gray-600 dark:text-gray-300"
                title={isDarkMode ? "Light Mode" : "Dark Mode"}
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <div className="h-px bg-gray-200 dark:bg-slate-700 my-1" />
               <button
                onClick={() => setMapMode(MapMode.TERRAIN)}
                className={`p-2 rounded-md transition-colors ${mapMode === MapMode.TERRAIN ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                title="Terrain"
              >
                <Mountain size={20} />
              </button>
              <button
                onClick={() => setMapMode(isDarkMode ? MapMode.DARK : MapMode.LIGHT)}
                className={`p-2 rounded-md transition-colors ${mapMode === MapMode.LIGHT || mapMode === MapMode.DARK ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                title="Standard"
              >
                <Layers size={20} />
              </button>
               <button
                onClick={() => setMapMode(MapMode.SATELLITE)}
                className={`p-2 rounded-md transition-colors ${mapMode === MapMode.SATELLITE ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                title="Satellite"
              >
                <Globe size={20} />
              </button>
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>

          {/* Search bar overlay for quick access (optional secondary search) */}
          <div className="absolute top-4 left-14 z-[400] md:hidden">
             {/* Mobile only search trigger could go here */}
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;
