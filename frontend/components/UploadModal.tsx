'use client';

import React, { useState } from 'react';
import { ApiClient } from '../lib/api';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);
    const validExts = ['.pdf', '.docx', '.txt', '.md'];
    const hasValidExt = validExts.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setErrorMessage('Unsupported file format. Please upload PDF, DOCX, TXT, or MD.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 20 MB limit.');
      return;
    }

    setSelectedFile(file);
  };

  const computeSha256 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(digest));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const executeUpload = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setErrorMessage(null);

      // 1. Compute Checksum
      setUploadStatus('Computing cryptographic SHA-256 checksum...');
      const checksum = await computeSha256(selectedFile);

      // 2. Request Upload Intent
      setUploadStatus('Creating upload intent with Cloudflare R2...');
      const mime = selectedFile.type || 'application/octet-stream';
      const intent = await ApiClient.createUploadIntent(
        selectedFile.name,
        mime,
        selectedFile.size,
        checksum
      );

      // 3. Direct PUT to Storage
      setUploadStatus('Streaming bytes directly to private object storage...');
      const putRes = await fetch(intent.upload_url, {
        method: 'PUT',
        headers: intent.headers,
        body: selectedFile
      });

      if (!putRes.ok) {
        throw new Error(`Direct storage upload failed with HTTP status ${putRes.status}`);
      }

      // 4. Complete Upload & Enqueue Ingestion Job
      setUploadStatus('Validating HEAD metadata & enqueuing ingestion...');
      await ApiClient.completeUpload(intent.document_id);

      setUploadStatus('Document uploaded successfully!');
      setTimeout(() => {
        setIsUploading(false);
        setSelectedFile(null);
        setUploadStatus('');
        onUploadSuccess();
        onClose();
      }, 800);

    } catch (err: any) {
      setIsUploading(false);
      setErrorMessage(err.message || 'Upload failed. Please check network connection and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
              ↑
            </div>
            <h3 className="font-semibold text-slate-100">Upload Source Document</h3>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragActive
                ? 'border-cyan-400 bg-cyan-500/5'
                : 'border-slate-700 bg-slate-950/40 hover:border-slate-600'
            }`}
          >
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800/80 flex items-center justify-center text-cyan-400">
              <svg className="w-6 h-6 shrink-0" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <p className="text-sm font-medium text-slate-200 mb-1">
              Drag and drop your file here, or{' '}
              <label className="text-cyan-400 hover:text-cyan-300 cursor-pointer underline underline-offset-2">
                browse files
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  disabled={isUploading}
                />
              </label>
            </p>
            <p className="text-xs text-slate-400">
              Supported: PDF, DOCX, TXT, Markdown (Max 20 MB, 200 pages)
            </p>
          </div>

          {selectedFile && (
            <div className="mt-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <span className="text-lg">📄</span>
                <div className="truncate">
                  <p className="text-sm font-medium text-slate-200 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              </div>
              {!isUploading && (
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1"
                >
                  Remove
                </button>
              )}
            </div>
          )}

          {/* Progress / Status feedback */}
          {isUploading && (
            <div className="mt-4 p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-xs text-cyan-300 flex items-center gap-2 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>{uploadStatus}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/40">
          <button
            onClick={onClose}
            disabled={isUploading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={executeUpload}
            disabled={!selectedFile || isUploading}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 disabled:opacity-50 transition-all shadow-md shadow-cyan-500/10 active:scale-95"
          >
            {isUploading ? 'Uploading...' : 'Start Ingestion'}
          </button>
        </div>
      </div>
    </div>
  );
};
