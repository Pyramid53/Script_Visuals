import React, { useState } from 'react';
import { generatePrompts, generateGeminiImage, Scene } from './lib/gemini';
import { Loader2, Copy, Check, Sparkles, Image as ImageIcon, FileText, Download, Upload, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './lib/utils';
import JSZip from 'jszip';

function App() {
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  // States for image generation
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [isGeneratingImage, setIsGeneratingImage] = useState<Record<string, boolean>>({});
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const autoGenerateRef = React.useRef(false);

  const handleGenerate = async () => {
    if (!script.trim()) return;
    
    const lines = script.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const generatedData = await generatePrompts(lines);
      setScenes(generatedData);
      setGeneratedImages({}); // clear previously generated images
      setIsAutoGenerating(false);
      autoGenerateRef.current = false;
    } catch (err) {
      console.error(err);
      setError('حدث خطأ أثناء توليد المشاهد. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  const parseUploadedFile = (content: string) => {
    try {
      const parsedScenes: Scene[] = [];

      const sceneBlocks = content.split(/--- Scene \d+ ---/g).slice(1);
      sceneBlocks.forEach((block, index) => {
          const sceneNumber = index + 1;
          const narrationMatch = block.match(/Narration:\s*(.*)/);
          const narration = narrationMatch ? narrationMatch[1].trim() : '';

          const promptMatch = block.match(/Prompt:\n([\s\S]*?)(?:==================================================|$)/);
          const englishPrompt = promptMatch ? promptMatch[1].trim() : '';

          if (narration || englishPrompt) {
            parsedScenes.push({ sceneNumber, narration, englishPrompt });
          }
      });

      if (parsedScenes.length === 0) {
        throw new Error("Invalid file format: Could not parse scenes.");
      }

      setScenes(parsedScenes);
      setGeneratedImages({});
      setIsAutoGenerating(false);
      autoGenerateRef.current = false;
      setError(null);
    } catch (err) {
       console.error(err);
       setError('Failed to parse the uploaded file. Make sure it is a valid exported TXT file.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        parseUploadedFile(content);
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const generateAndLoadImage = async (id: string, prompt: string) => {
    setIsGeneratingImage(prev => ({ ...prev, [id]: true }));
    try {
      const dataUrl = await generateGeminiImage(prompt);
      setGeneratedImages(prev => ({ ...prev, [id]: dataUrl }));
    } catch (error) {
      console.error("Failed to generate image:", error);
      alert("Failed to generate image. Check console for details.");
    } finally {
      setIsGeneratingImage(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleAutoGenerateImages = async () => {
    if (scenes.length === 0) return;
    setIsAutoGenerating(true);
    autoGenerateRef.current = true;

    for (let i = 0; i < scenes.length; i++) {
        if (!autoGenerateRef.current) break;
        
        const sceneId = `scene-${i}`;
        if (!generatedImages[sceneId]) {
           await generateAndLoadImage(sceneId, scenes[i].englishPrompt);
           
           // Wait 30s if not the last scene
           if (i < scenes.length - 1 && autoGenerateRef.current) {
              await new Promise(resolve => setTimeout(resolve, 30000));
           }
        }
    }
    
    setIsAutoGenerating(false);
    autoGenerateRef.current = false;
  };
  
  const handleStopAutoGenerate = () => {
    setIsAutoGenerating(false);
    autoGenerateRef.current = false;
  };

  const handleDownloadImage = (id: string, filename: string) => {
    const url = generatedImages[id];
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllImages = async () => {
    const imageIds = Object.keys(generatedImages);
    if (imageIds.length === 0) return;

    const zip = new JSZip();
    
    for (const id of imageIds) {
      const dataUrl = generatedImages[id];
      // Convert data URL to Blob
      try {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        
        // Extract the scene index
        const indexMatch = id.match(/scene-(\d+)/);
        const sceneNumber = indexMatch ? parseInt(indexMatch[1]) + 1 : id;
        
        zip.file(`scene_${sceneNumber}.jpg`, blob);
      } catch (err) {
        console.error("Failed to add image to zip:", err);
      }
    }

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = 'all_generated_images.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to generate zip file:", err);
      alert("Failed to generate zip file.");
    }
  };

  const handleExportTxt = () => {
    if (scenes.length === 0) return;

    let content = "Scenes and Prompts File\n\n";

    // Scenes Export
    scenes.forEach(scene => {
      content += `--- Scene ${scene.sceneNumber} ---\n`;
      content += `Narration: ${scene.narration}\n\n`;
      content += `Prompt:\n${scene.englishPrompt}\n\n`;
      content += `==================================================\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scenes_prompts.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const linesCount = script.split('\n').map(line => line.trim()).filter(line => line.length > 0).length;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans" dir="ltr">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-2 rounded-lg text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Smart Scene Creator</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section className="bg-white rounded-2xl shadow-sm border border-neutral-200 p-6 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="script" className="block text-sm font-medium text-neutral-700">
                Script
              </label>
              <span className="text-sm text-neutral-500 font-medium">
                Scenes (Lines): {linesCount}
              </span>
            </div>
            <textarea
              id="script"
              rows={8}
              className="w-full rounded-xl border-neutral-300 shadow-sm focus:border-primary focus:ring-primary resize-none p-4 text-neutral-800 bg-neutral-50 border"
              placeholder="Enter your script here..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <div className="relative">
              <input
                type="file"
                accept=".txt"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                title="Upload exported TXT file"
              />
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950"
              >
                <Upload className="w-4 h-4" />
                Upload File
              </button>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isLoading || !script.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white shadow transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:pointer-events-none disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Scenes
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}
        </section>

        <AnimatePresence>
          {scenes.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between flex-wrap gap-4">
                <h2 className="text-2xl font-bold tracking-tight">Suggested Results</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {Object.keys(generatedImages).length > 0 && (
                     <button
                       onClick={handleDownloadAllImages}
                       className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                     >
                       <Archive className="w-4 h-4" />
                       Download All Images
                     </button>
                  )}
                  {isAutoGenerating ? (
                    <button
                      onClick={handleStopAutoGenerate}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-100 px-4 py-2 text-sm font-medium text-red-700 shadow-sm transition-colors hover:bg-red-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-950"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Stop Auto Generation
                    </button>
                  ) : (
                    <button
                      onClick={handleAutoGenerateImages}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950"
                    >
                      <ImageIcon className="w-4 h-4" />
                      Auto Generate Images
                    </button>
                  )}
                  <button
                    onClick={handleExportTxt}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950"
                  >
                    <Download className="w-4 h-4" />
                    Export as TXT
                  </button>
                </div>
              </div>

              {/* Scenes Section */}
              <div className="grid gap-6 mt-8">
                <h3 className="text-xl font-bold tracking-tight text-neutral-800">Video Scenes</h3>
                {scenes.map((scene, index) => {
                  const sceneId = `scene-${index}`;
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden flex flex-col"
                    >
                      <div className="bg-neutral-900 text-white px-6 py-3 flex items-center justify-between">
                        <span className="font-medium">Scene {scene.sceneNumber}</span>
                        <button
                          onClick={() => generateAndLoadImage(sceneId, scene.englishPrompt)}
                          disabled={isGeneratingImage[sceneId]}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-neutral-600 focus-visible:outline-none disabled:opacity-50"
                        >
                          {isGeneratingImage[sceneId] ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                          ) : (
                            <><ImageIcon className="w-3 h-3" /> Generate Image</>
                          )}
                        </button>
                      </div>
                      
                      {/* Generated Scene Display */}
                      {generatedImages[sceneId] && (
                        <div className="bg-neutral-100 border-b border-neutral-200">
                           <div className="relative group max-w-xl mx-auto aspect-video">
                            <img src={generatedImages[sceneId]} alt={`Scene ${scene.sceneNumber}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                onClick={() => handleDownloadImage(sceneId, `scene_${scene.sceneNumber}.jpg`)}
                                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-100 shadow-lg"
                              >
                                <Download className="w-4 h-4" /> Download
                              </button>
                            </div>
                           </div>
                        </div>
                      )}
                      
                      <div className="p-6 space-y-6">
                      
                      {/* Narration */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-neutral-500">
                          <FileText className="w-4 h-4" />
                          <h3 className="text-sm font-medium uppercase tracking-wider">Narration</h3>
                        </div>
                        <p className="text-neutral-800 leading-relaxed bg-neutral-50 p-4 rounded-xl border border-neutral-100" dir="rtl">
                          {scene.narration}
                        </p>
                      </div>

                      {/* English Prompt */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-neutral-500">
                            <ImageIcon className="w-4 h-4" />
                            <h3 className="text-sm font-medium uppercase tracking-wider">Prompt (English)</h3>
                          </div>
                          <button
                            onClick={() => copyToClipboard(scene.englishPrompt, `scene-${index}`)}
                            className="text-neutral-400 hover:text-neutral-900 transition-colors"
                            title="Copy Prompt"
                          >
                            {copiedIndex === `scene-${index}` ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-100 relative group h-full" dir="ltr">
                          <p className="text-neutral-700 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                            {scene.englishPrompt}
                          </p>
                        </div>
                      </div>

                    </div>
                  </motion.div>
                );
                })}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
