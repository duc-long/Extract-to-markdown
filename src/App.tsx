/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  FileText, Upload, Copy, Download, Loader2, CheckCircle, AlertCircle, Clock
} from 'lucide-react';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const estimatedTime = useMemo(() => {
    if (!file) return null;
    const sizeMB = file.size / (1024 * 1024);
    let baseSeconds = 0;
    const name = file.name.toLowerCase();
    
    let estimatedElements = '';
    
    // Heuristic estimation based on file type and size
    if (name.endsWith('.pdf') || file.type === 'application/pdf') {
      // PDF parsing with tables can be very slow, around ~85s per MB locally on large files
      baseSeconds = 10 + sizeMB * 85;
      const estPages = Math.max(1, Math.round((file.size / 1024) / 100)); // Rough estimate: 100KB per page
      estimatedElements = `~${estPages} page(s)`;
    } else if (name.endsWith('.docx')) {
      // Mammoth is faster but still takes time on large files
      baseSeconds = 2 + sizeMB * 10;
      const estPages = Math.max(1, Math.round((file.size / 1024) / 30)); // Rough estimate: 30KB per page
      estimatedElements = `~${estPages} page(s)`;
    } else if (name.endsWith('.xlsx')) {
      // XLSX can be slower if there are many sheets and rows
      baseSeconds = 2 + sizeMB * 15;
      const estRows = Math.max(1, Math.round((file.size / 1024) * 10)); // Rough estimate: 10 rows per KB
      estimatedElements = `~${estRows} row(s)`;
    } else if (file.type.startsWith('image/') || /\.(png|jpe?g|bmp|webp)$/i.test(name)) {
      // Tesseract OCR can be slow, ~30s per MB
      baseSeconds = 5 + sizeMB * 30;
      estimatedElements = `1 image`;
    } else {
      baseSeconds = 5 + sizeMB * 10;
    }
    
    const totalSeconds = Math.max(1, Math.ceil(baseSeconds));
    let timeStr = '';
    if (totalSeconds < 60) {
      timeStr = `~${totalSeconds} seconds`;
    } else {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      timeStr = `~${mins}m ${secs}s`;
    }

    return { timeStr, estimatedElements, totalSeconds };
  }, [file]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isConverting && estimatedTime) {
      setProgress(0);
      
      const increment = 100 / (estimatedTime.totalSeconds * 10);
      
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 98) return 98;
          return prev + increment;
        });
      }, 100);
    } else {
      setProgress(0);
    }
    
    return () => clearInterval(interval);
  }, [isConverting, estimatedTime]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && (selectedFile.type === 'application/pdf' || selectedFile.type.startsWith('image/') || /\.(pdf|docx|xlsx|png|jpe?g|bmp|webp)$/i.test(selectedFile.name))) {
      setFile(selectedFile);
      setMarkdown('');
      setError(null);
    } else if (selectedFile) {
      setError("Please select a valid PDF, DOCX, XLSX, or Image file.");
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && (droppedFile.type === 'application/pdf' || droppedFile.type.startsWith('image/') || /\.(pdf|docx|xlsx|png|jpe?g|bmp|webp)$/i.test(droppedFile.name))) {
      setFile(droppedFile);
      setMarkdown('');
      setError(null);
    } else if (droppedFile) {
      setError("Please drop a valid PDF, DOCX, XLSX, or Image file.");
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleConvert = async () => {
    if (!file) return;

    setIsConverting(true);
    setError(null);
    setMarkdown('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/convert-file', {
        method: 'POST',
        body: formData,
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`Server returned an invalid response (status: ${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to convert file');
      }

      setMarkdown(data.markdown);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsConverting(false);
    }
  };

  const handleCopy = () => {
    if (!markdown) return;
    navigator.clipboard.writeText(markdown).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file ? `${file.name.replace(/\.[^/.]+$/, "")}.md` : 'converted.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#f3f3f3] text-[#1a1a1a] overflow-hidden p-2">
      <main className="flex flex-1 overflow-hidden gap-2">
        {/* Left Column: PDF Input & Info */}
        <section className="w-full md:w-1/3 lg:w-1/4 flex flex-col bg-[#f3f3f3]">
          
          <div className="flex-1 overflow-auto flex flex-col gap-2">
            {!file ? (
              <div 
                className="w-full h-full bg-white border border-black/5 shadow-sm rounded-[8px] flex flex-col items-center justify-center p-8 text-center hover:bg-[#fafafa] transition-colors cursor-pointer group"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <input 
                  type="file" 
                  accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.bmp,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                <div className="w-12 h-12 bg-[#f3f3f3] text-[#1a1a1a] rounded-[4px] border border-black/5 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-200">
                  <Upload className="w-5 h-5" />
                </div>
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Select a document</h3>
                <p className="text-[#5c5c5c] text-[12px] leading-relaxed mb-4">
                  Drag & drop or click to browse
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                  <span className="px-2 py-1 bg-[#f3f3f3] border border-black/5 text-[#5c5c5c] text-[10px] font-semibold rounded-[4px]">PDF</span>
                  <span className="px-2 py-1 bg-[#f3f3f3] border border-black/5 text-[#5c5c5c] text-[10px] font-semibold rounded-[4px]">DOCX</span>
                  <span className="px-2 py-1 bg-[#f3f3f3] border border-black/5 text-[#5c5c5c] text-[10px] font-semibold rounded-[4px]">XLSX</span>
                  <span className="px-2 py-1 bg-[#f3f3f3] border border-black/5 text-[#5c5c5c] text-[10px] font-semibold rounded-[4px]">IMG</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 h-full">
                <div className="p-4 bg-white border border-black/5 shadow-sm rounded-[8px] flex items-start gap-3">
                  <FileText className="w-8 h-8 text-[#005fb8] shrink-0" />
                  <div className="overflow-hidden w-full">
                    <p className="text-[14px] font-semibold text-[#1a1a1a] truncate" title={file.name}>
                      {file.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2 w-full">
                      <span className="text-[11px] font-medium text-[#5c5c5c] bg-[#f3f3f3] px-2 py-0.5 rounded-[4px] shrink-0">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      {estimatedTime && (
                        <>
                          {estimatedTime.estimatedElements && (
                            <div className="flex items-center gap-1 text-[11px] font-medium text-[#5c5c5c] bg-[#f3f3f3] px-2 py-0.5 rounded-[4px] shrink-0" title="Estimated size/pages">
                              <FileText className="w-3 h-3 text-[#5c5c5c]" />
                              <span>{estimatedTime.estimatedElements}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-[11px] font-medium text-[#005fb8] bg-[#cce3fa] px-2 py-0.5 rounded-[4px] shrink-0" title="Estimated extraction time">
                            <Clock className="w-3 h-3 text-[#005fb8]" />
                            <span>{estimatedTime.timeStr} est.</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-black/5 shadow-sm rounded-[8px] p-4 flex flex-col gap-3">
                  <button
                    onClick={handleConvert}
                    disabled={isConverting}
                    className="w-full flex items-center justify-center gap-2 py-1.5 bg-[#005fb8] hover:bg-[#0256a5] disabled:bg-[#f3f3f3] disabled:text-[#a1a1a1] disabled:border-transparent text-white rounded-[4px] text-[14px] font-medium transition-colors border border-transparent border-b-black/20 active:border-b-transparent active:translate-y-[1px]"
                  >
                    {isConverting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                      </>
                    ) : (
                      <>
                        Extract Markdown
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setFile(null)}
                    disabled={isConverting}
                    className="w-full py-1.5 text-[14px] font-medium text-[#1a1a1a] bg-[#fdfdfd] hover:bg-[#f3f3f3] active:bg-[#e5e5e5] border border-black/10 border-b-black/20 rounded-[4px] transition-colors active:border-b-black/10 active:translate-y-[1px]"
                  >
                    Clear selection
                  </button>
                </div>
              </div>
            )}
            
            {error && (
              <div className="p-3 bg-[#fdfdfd] border-l-4 border-l-[#d13438] border border-black/5 shadow-sm text-[#1a1a1a] rounded-[4px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#d13438]" />
                <p className="text-[12px]">{error}</p>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Markdown Output */}
        <section className="flex-1 bg-white border border-black/5 shadow-sm rounded-[8px] flex flex-col h-[50vh] lg:h-auto overflow-hidden relative">
           <div className="h-[48px] bg-white flex items-center justify-between px-4 shrink-0 border-b border-[#e5e5e5]">
             <span className="text-[14px] font-semibold text-[#1a1a1a]">
                Markdown Output
             </span>
             
             <div className="flex gap-2">
               <button
                 onClick={handleCopy}
                 disabled={!markdown}
                 className="flex items-center gap-1.5 px-3 py-1 bg-[#fdfdfd] hover:bg-[#f3f3f3] active:bg-[#e5e5e5] text-[#1a1a1a] border border-black/10 border-b-black/20 rounded-[4px] text-[12px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:border-b-black/10 active:translate-y-[1px]"
                 title="Copy Markdown"
               >
                 {copySuccess ? <CheckCircle className="w-3.5 h-3.5 text-[#107c10]" /> : <Copy className="w-3.5 h-3.5" />}
                 {copySuccess ? 'Copied' : 'Copy'}
               </button>
               <button
                 onClick={handleDownload}
                 disabled={!markdown}
                 className="flex items-center gap-1.5 px-3 py-1 bg-[#fdfdfd] hover:bg-[#f3f3f3] active:bg-[#e5e5e5] text-[#1a1a1a] border border-black/10 border-b-black/20 rounded-[4px] text-[12px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:border-b-black/10 active:translate-y-[1px]"
                 title="Download .md file"
               >
                 <Download className="w-3.5 h-3.5" />
                 Download
               </button>
             </div>
           </div>

           <div className="flex-1 overflow-auto p-6 bg-white relative font-mono text-[14px] text-[#1a1a1a]">
             {!markdown && !isConverting && (
               <div className="h-full flex flex-col items-center justify-center text-[#5c5c5c]">
                 <FileText className="w-12 h-12 mb-4 opacity-20" />
                 <p className="text-[14px]">Convert a document to see the result here.</p>
               </div>
             )}
             
             {isConverting && (
               <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-20">
                 <Loader2 className="w-8 h-8 animate-spin text-[#005fb8] mb-4" />
                 <p className="text-[14px] font-semibold text-[#1a1a1a]">Extracting Text</p>
                 <p className="text-[12px] text-[#5c5c5c] mt-1 mb-6">Smart text extraction</p>
                 
                 <div className="w-64 max-w-full px-4">
                   <div className="h-[4px] w-full bg-[#e5e5e5] rounded-full overflow-hidden">
                     <div 
                       className="h-full bg-[#005fb8] transition-all duration-100 ease-linear rounded-full"
                       style={{ width: `${progress}%` }}
                     />
                   </div>
                   <div className="flex justify-between items-center mt-2 text-[12px] text-[#5c5c5c] font-medium">
                     <span>{Math.round(progress)}%</span>
                     <span>{estimatedTime?.timeStr}</span>
                   </div>
                 </div>
               </div>
             )}

             {markdown && (
               <div className="prose prose-sm max-w-none 
                 prose-headings:text-[#1a1a1a] prose-headings:font-semibold
                 prose-h1:border-b-0
                 prose-h2:border-b-0
                 prose-a:text-[#005fb8] 
                 prose-table:border-collapse prose-th:border prose-th:border-[#e5e5e5] prose-th:bg-[#f3f3f3] prose-th:p-2 prose-th:text-[#1a1a1a]
                 prose-td:border prose-td:border-[#e5e5e5] prose-td:p-2 prose-td:text-[#1a1a1a]
                 prose-pre:bg-[#f3f3f3] prose-pre:border prose-pre:border-[#e5e5e5] prose-pre:text-[#1a1a1a] prose-pre:rounded-[4px]
                 prose-code:text-[#c42b1c] prose-code:bg-[#f3f3f3] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-[4px] prose-code:font-medium
                 prose-p:text-[#1a1a1a] prose-li:text-[#1a1a1a]"
               >
                 <ReactMarkdown 
                   remarkPlugins={[remarkGfm, remarkMath]} 
                   rehypePlugins={[rehypeKatex]}
                 >
                   {markdown}
                 </ReactMarkdown>
               </div>
             )}
           </div>
        </section>
      </main>
    </div>
  );
}
