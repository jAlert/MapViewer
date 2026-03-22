import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw, HardDrive, Calendar, Download } from 'lucide-react';
import { getAllStoredFiles, deleteStoredFile, getStorageStats, subscribeToFiles } from '../services/storageService';
import { StoredFile } from '../types';

interface FileManagerProps {
  onFileSelect?: (file: StoredFile) => void;
}

const FileManager: React.FC<FileManagerProps> = ({ onFileSelect }) => {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [storageStats, setStorageStats] = useState({ fileCount: 0, totalSize: 0 });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Load files on mount and subscribe to real-time updates
  useEffect(() => {
    loadFiles();

    // Subscribe to real-time file updates
    try {
      const unsubscribe = subscribeToFiles(
        (files) => {
          setFiles(files);
          updateStorageStats(files);
        },
        (error) => {
          console.warn('Subscription error', error);
        }
      );

      // Cleanup subscription on unmount
      return () => {
        try {
          unsubscribe();
        } catch (e) {
          console.warn('Error unsubscribing:', e);
        }
      };
    } catch (error) {
      console.warn('Real-time subscription not available', error);
      return undefined;
    }
  }, []);

  const updateStorageStats = async (filesData: StoredFile[]) => {
    try {
      const stats = await getStorageStats();
      setStorageStats(stats);
    } catch (error) {
      console.error('Failed to get storage stats:', error);
    }
  };

  const loadFiles = async () => {
    setLoading(true);
    try {
      const storedFiles = await getAllStoredFiles();
      setFiles(storedFiles);
      
      const stats = await getStorageStats();
      setStorageStats(stats);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      try {
        await deleteStoredFile(id);
        await loadFiles();
        if (selectedFile === id) setSelectedFile(null);
      } catch (error) {
        console.error('Failed to delete file:', error);
        alert('Failed to delete file');
      }
    }
  };

  const handleDownload = (file: StoredFile) => {
    if (!file.layerData) {
      alert('This file cannot be re-downloaded as the geographic data is not persisted. Layer data is kept in memory during your session.');
      return;
    }

    try {
      // Download the parsed layer data as GeoJSON
      const geojson = {
        type: 'FeatureCollection',
        features: file.layerData || []
      };
      
      const jsonString = JSON.stringify(geojson, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename.replace(/\.[^/.]+$/, '.geojson');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
      alert('Failed to download file');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileTypeColor = (fileType: string): string => {
    switch (fileType) {
      case 'shapefile':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'geojson':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'kml':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="text-blue-500" size={20} />
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Stored Files</h3>
          </div>
          <button
            onClick={loadFiles}
            disabled={loading}
            className="p-2 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        
        {/* Storage Stats */}
        <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <p>Files stored: <span className="font-semibold text-gray-800 dark:text-gray-200">{storageStats.fileCount}</span></p>
          <p>Total size: <span className="font-semibold text-gray-800 dark:text-gray-200">{formatFileSize(storageStats.totalSize)}</span></p>
        </div>
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
              <p>Loading files...</p>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <HardDrive size={40} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">No stored files yet</p>
              <p className="text-xs mt-1">Upload a file to get started</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => {
                  setSelectedFile(file.id);
                  onFileSelect?.(file);
                }}
                className={`p-3 rounded-lg border border-gray-200 dark:border-slate-700 cursor-pointer transition-all ${
                  selectedFile === file.id
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                      {file.filename}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${getFileTypeColor(file.fileType)}`}>
                        {file.fileType.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.fileSize)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <Calendar size={12} />
                      {formatDate(file.uploadedAt)}
                    </div>
                    
                    {/* Layer Preview */}
                    {file.layerData && Array.isArray(file.layerData) && file.layerData.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-slate-700">
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                          Layers ({file.layerData.length}):
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {file.layerData.slice(0, 3).map((layer, idx) => (
                            <span
                              key={idx}
                              className="text-xs bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded"
                            >
                              {layer.name || `Layer ${idx + 1}`}
                            </span>
                          ))}
                          {file.layerData.length > 3 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 px-2 py-0.5">
                              +{file.layerData.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file);
                      }}
                      className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors text-blue-600 dark:text-blue-400"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file.id);
                      }}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors text-red-600 dark:text-red-400"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FileManager;
