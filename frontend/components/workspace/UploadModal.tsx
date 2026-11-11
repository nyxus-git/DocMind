'use client';

import React, { useRef, useState } from 'react';
import { ApiClient, KnowledgeSpaceDTO } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import { Button, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';

type ItemStatus = 'queued' | 'hashing' | 'uploading' | 'processing' | 'done' | 'error';
interface Item {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
}

const EXTS = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json', '.html', '.htm'];

const STATUS_TEXT: Record<ItemStatus, string> = {
  queued: 'Waiting',
  hashing: 'Checking file',
  uploading: 'Uploading',
  processing: 'Starting processing',
  done: 'Uploaded. Processing continues in the background.',
  error: 'Failed',
};

async function sha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  maxFileMb: number;
  spaces?: KnowledgeSpaceDTO[];
}

/** State lives in the body, so closing the dialog resets the queue. */
export function UploadModal(props: UploadModalProps) {
  return props.open ? <UploadModalBody {...props} /> : null;
}

function UploadModalBody({ open, onClose, onUploaded, maxFileMb, spaces = [] }: UploadModalProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | File[]) => {
    const accepted: Item[] = [];
    const problems: string[] = [];
    Array.from(list).forEach(file => {
      const lower = file.name.toLowerCase();
      if (!EXTS.some(e => lower.endsWith(e))) {
        problems.push(`${file.name}: use PDF, DOCX, TXT, MD, CSV, JSON or HTML.`);
      } else if (file.size > maxFileMb * 1024 * 1024) {
        problems.push(`${file.name}: larger than your plan’s ${maxFileMb} MB limit.`);
      } else {
        accepted.push({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`, file, status: 'queued' });
      }
    });
    setRejected(problems.length ? problems.join(' ') : null);
    if (accepted.length) setItems(prev => [...prev, ...accepted]);
  };

  const patch = (id: string, p: Partial<Item>) => setItems(prev => prev.map(i => (i.id === id ? { ...i, ...p } : i)));

  const start = async () => {
    setRunning(true);
    let anyDone = false;
    for (const item of items) {
      if (item.status !== 'queued' && item.status !== 'error') continue;
      try {
        patch(item.id, { status: 'hashing', error: undefined });
        const checksum = await sha256(item.file);
        const intent = await ApiClient.createUploadIntent(
          item.file.name,
          item.file.type || 'application/octet-stream',
          item.file.size,
          checksum,
          selectedSpaceId || undefined,
        );
        patch(item.id, { status: 'uploading' });
        const put = await fetch(intent.upload_url, { method: intent.method || 'PUT', headers: intent.headers, body: item.file });
        if (!put.ok) throw new Error(`Storage rejected the upload (HTTP ${put.status}).`);
        patch(item.id, { status: 'processing' });
        await ApiClient.completeUpload(intent.document_id);
        patch(item.id, { status: 'done' });
        anyDone = true;
      } catch (err) {
        patch(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed. Try again.' });
      }
    }
    setRunning(false);
    if (anyDone) onUploaded();
  };

  const pending = items.filter(i => i.status === 'queued' || i.status === 'error').length;
  const allDone = items.length > 0 && items.every(i => i.status === 'done');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload documents"
      description={`PDF, Word, CSV, JSON, HTML, text or Markdown. Up to ${maxFileMb} MB each.`}
      lockClose={running}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            {allDone ? 'Close' : 'Cancel'}
          </Button>
          {!allDone && (
            <Button onClick={start} disabled={running || pending === 0}>
              {running && <Spinner />}
              {running ? 'Uploading' : pending > 1 ? `Upload ${pending} files` : 'Upload'}
            </Button>
          )}
        </>
      }
    >
      {spaces.length > 0 && (
        <div className="mb-4">
          <label htmlFor="upload-space" className="mb-1.5 block text-sm font-medium">
            Department / Knowledge Space
          </label>
          <select
            id="upload-space"
            value={selectedSpaceId}
            onChange={e => setSelectedSpaceId(e.target.value)}
            disabled={running}
            className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus:border-fg focus:outline-none"
          >
            <option value="">General (All company members)</option>
            {spaces.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.visibility === 'RESTRICTED' ? 'Restricted' : 'All members'})
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        onDragEnter={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          if (!running && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
          dragging ? 'border-fg bg-surface-2' : 'border-line-strong bg-bg'
        }`}
      >
        <Icon name="upload" className="mx-auto size-7 text-muted" />
        <p className="mt-3 text-[15px] font-medium">Drag files here</p>
        <p className="mt-1 text-sm text-muted">
          or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={running}
            className="font-medium text-fg underline underline-offset-2"
          >
            choose files
          </button>
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm"
          className="sr-only"
          tabIndex={-1}
          onChange={e => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {rejected && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {rejected}
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {items.map(i => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.file.name}</p>
                <p className={`text-[13px] ${i.status === 'error' ? 'text-danger' : i.status === 'done' ? 'text-ok' : 'text-muted'}`}>
                  {formatBytes(i.file.size)} &bull; {i.status === 'error' ? i.error : STATUS_TEXT[i.status]}
                </p>
              </div>
              {i.status === 'done' ? (
                <Icon name="check" className="size-4 text-ok" strokeWidth={2.2} />
              ) : i.status === 'hashing' || i.status === 'uploading' || i.status === 'processing' ? (
                <Spinner className="size-4 text-muted" />
              ) : (
                !running && (
                  <button
                    type="button"
                    aria-label={`Remove ${i.file.name}`}
                    onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Icon name="x" className="size-4" />
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
