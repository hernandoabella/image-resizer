"use client";

import { useState, useMemo, useCallback, useRef, ChangeEvent } from "react";
import { FaUpload, FaDownload, FaSpinner, FaTrash } from "react-icons/fa";

// =============================================================================
// TIPOS Y AYUDAS
// =============================================================================

// Estado individual para rastrear cada imagen
type ImageState = {
  id: string;
  fileName: string;
  originalSrc: string;
  resizedSrc: string | null;
  isProcessing: boolean;
  error: string | null;
};

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export default function BatchImageResizer() {
  const [images, setImages] = useState<ImageState[]>([]);
  const [targetWidth, setTargetWidth] = useState<number>(1280); // Ancho deseado
  const [isResizingAll, setIsResizingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // LÓGICA DE REDIMENSIONAMIENTO (CORE)
  // ---------------------------------------------------------------------------

  const resizeSingleImage = useCallback((id: string, src: string, targetSize: number) => {
    
    // Iniciar el estado de procesamiento para esta imagen
    setImages(prev => prev.map(img => img.id === id ? { ...img, isProcessing: true, resizedSrc: null, error: null } : img));

    const img = new Image();
    img.src = src;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        setImages(prev => prev.map(i => i.id === id ? { ...i, isProcessing: false, error: "Canvas context failed." } : i));
        return;
      }

      // Calcular el nuevo alto manteniendo la relación de aspecto
      const scale = targetSize / img.width;
      const newHeight = img.height * scale;

      canvas.width = targetSize;
      canvas.height = newHeight;

      // Dibujar la imagen en el canvas (redimensionamiento)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      // Salida JPEG con calidad por defecto (0.9)
      const output = canvas.toDataURL("image/jpeg", 0.9);

      // Actualizar el estado con el resultado
      setImages(prev => prev.map(i => 
        i.id === id ? { ...i, resizedSrc: output, isProcessing: false } : i
      ));
    };

    img.onerror = () => {
      setImages(prev => prev.map(i => i.id === id ? { ...i, isProcessing: false, error: 'Image load failed.' } : i));
    };
  }, []);

  // ---------------------------------------------------------------------------
  // MANEJO DE ARCHIVOS MÚLTIPLES
  // ---------------------------------------------------------------------------

  const handleFileProcessing = useCallback((fileList: FileList) => {
    
    const newImages: ImageState[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];

      if (!file.type.startsWith('image/')) {
        console.warn(`File ${file.name} ignored: Not an image.`);
        continue;
      }

      const id = crypto.randomUUID();

      // Leer el archivo
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => {
        const src = event.target?.result as string;
        
        const newStateItem: ImageState = {
            id,
            fileName: file.name,
            originalSrc: src,
            resizedSrc: null,
            isProcessing: false, // Se establece en true al llamar a resizeSingleImage
            error: null,
        };
        
        // Añadir el archivo al estado y empezar el proceso
        setImages(prev => [...prev, newStateItem]);
        resizeSingleImage(id, src, targetWidth);
      };
      reader.readAsDataURL(file);
    }
  }, [resizeSingleImage, targetWidth]);


  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileProcessing(e.target.files);
      // Limpiar el valor del input para permitir cargar los mismos archivos de nuevo
      e.target.value = ''; 
    }
  };

  // ---------------------------------------------------------------------------
  // LÓGICA DE EVENTOS (BOTONES)
  // ---------------------------------------------------------------------------

  const handleWidthChange = (newWidth: number) => {
    setTargetWidth(newWidth);
    
    // Re-dimensionar todas las imágenes con el nuevo ancho
    if (images.length > 0) {
      setIsResizingAll(true);
      images.forEach(img => {
        if (img.originalSrc) {
          // Re-dimensionar asíncronamente
          setTimeout(() => resizeSingleImage(img.id, img.originalSrc, newWidth), 20); 
        }
      });
      setTimeout(() => setIsResizingAll(false), 500); 
    }
  };

  const handleRemoveImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  // ---------------------------------------------------------------------------
  // DESCARGA POR LOTES (ZIP)
  // ---------------------------------------------------------------------------

  const allProcessed = useMemo(() => {
    return images.length > 0 && images.every(img => img.resizedSrc || img.error);
  }, [images]);

  const handleBatchDownload = async () => {
    if (!allProcessed) {
      alert("Please wait for all images to finish resizing.");
      return;
    }

    try {
      // Importar JSZip dinámicamente
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      images.forEach((img) => {
        if (img.resizedSrc) {
          const base64 = img.resizedSrc.split(',')[1];
          const originalName = img.fileName.replace(/\.[^/.]+$/, ""); 
          // Nombre del archivo indicando el tamaño
          const fileName = `${originalName}_${targetWidth}px.jpg`; 
          zip.file(fileName, base64, { base64: true });
        }
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `resized_batch_${targetWidth}px.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      alert("Error creating ZIP file. Please check console.");
      console.error(error);
    }
  };


  // ---------------------------------------------------------------------------
  // RENDERIZADO
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col items-center bg-gray-900 text-white p-10">
      <div className="max-w-4xl w-full">
        
        <h1 className="text-4xl font-extrabold mb-8 text-center text-blue-400">
            📏 Batch Image Resizer
        </h1>

        {/* Upload Zone */}
        <div 
            className="border-3 border-dashed border-gray-600 rounded-xl p-10 text-center cursor-pointer transition-all duration-300 hover:border-blue-500 hover:bg-gray-800 mb-8"
            onClick={() => fileInputRef.current?.click()}
        >
            <FaUpload className="text-blue-400 text-3xl mx-auto mb-3" />
            <h3 className="text-xl font-semibold">Click or Drag & Drop Multiple Images Here</h3>
            <p className="text-gray-400">JPG, PNG, GIF, etc.</p>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple // ⬅️ CLAVE: Habilitar la selección de múltiples archivos
                onChange={handleImageUpload}
                className="hidden"
            />
        </div>

        {images.length > 0 && (
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-8">
            
            {/* Size Options & Global Status */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6">
              <h2 className="text-xl font-semibold mb-2 md:mb-0">
                  Target Width: {targetWidth}px
                  {(isResizingAll || images.some(img => img.isProcessing)) && (
                      <FaSpinner className="animate-spin text-blue-400 text-base ml-3 inline" />
                  )}
              </h2>
              
              <div className="flex gap-3">
                <button
                  onClick={() => handleWidthChange(800)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${targetWidth === 800 ? "bg-blue-600 font-bold" : "bg-gray-700 hover:bg-gray-600"}`}
                >
                  Small (800px)
                </button>

                <button
                  onClick={() => handleWidthChange(1280)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${targetWidth === 1280 ? "bg-blue-600 font-bold" : "bg-gray-700 hover:bg-gray-600"}`}
                >
                  Medium (1280px)
                </button>

                <button
                  onClick={() => handleWidthChange(1920)}
                  className={`px-4 py-2 rounded-lg text-sm transition-colors ${targetWidth === 1920 ? "bg-blue-600 font-bold" : "bg-gray-700 hover:bg-gray-600"}`}
                >
                  Large (1920px)
                </button>
              </div>
            </div>

            {/* Batch Download */}
            <div className="text-center mb-6 border-t border-gray-700 pt-4">
                <button
                    onClick={handleBatchDownload}
                    disabled={!allProcessed}
                    className={`
                        flex items-center gap-2 mx-auto font-semibold px-6 py-3 rounded-lg shadow-lg transition-all duration-300
                        ${allProcessed 
                            ? 'bg-green-600 text-white hover:bg-green-700' 
                            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        }
                    `}
                >
                    <FaDownload />
                    Download All as ZIP ({targetWidth}px)
                </button>
            </div>

            {/* File Queue List */}
            <div className="space-y-4">
              {images.map(img => (
                <div key={img.id} className="bg-gray-900 p-4 rounded-lg flex items-center justify-between border border-gray-700">
                  
                  {/* Info and Preview */}
                  <div className="flex items-center gap-4 min-w-0 flex-grow">
                      <div className="flex-shrink-0 w-12 h-12 bg-gray-700 rounded overflow-hidden flex items-center justify-center">
                          {img.resizedSrc ? (
                              <img src={img.resizedSrc} alt="Thumbnail" className="w-full h-full object-cover" />
                          ) : (
                              <FaUpload className="text-gray-500 text-xl" />
                          )}
                      </div>
                      <div className="min-w-0">
                          <p className="font-semibold truncate">{img.fileName}</p>
                          <p className="text-sm text-gray-400">
                            {img.isProcessing ? "Processing..." : img.error ? "Error" : `Ready (${targetWidth}px)`}
                          </p>
                      </div>
                  </div>
                  
                  {/* Status / Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {img.isProcessing && <FaSpinner className="animate-spin text-blue-400" />}
                    {img.error && <span className="text-red-500 text-sm">Error</span>}

                    {img.resizedSrc && (
                      <a
                        download={`${img.fileName.replace(/\.[^/.]+$/, "")}_${targetWidth}px.jpg`}
                        href={img.resizedSrc}
                        className="p-2 text-white bg-green-600 rounded-full hover:bg-green-700 transition-colors"
                        title="Download Single Image"
                      >
                        <FaDownload className="text-sm" />
                      </a>
                    )}
                    <button
                        onClick={() => handleRemoveImage(img.id)}
                        className="p-2 text-red-400 bg-gray-700 rounded-full hover:bg-red-900 transition-colors"
                        title="Remove"
                    >
                        <FaTrash className="text-sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .border-3 { border-width: 3px; }
      `}</style>
    </div>
  );
}