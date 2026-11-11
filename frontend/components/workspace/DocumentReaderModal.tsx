'use client';

import React from 'react';
import { ApiClient, ApiError, DocumentContentDTO } from '../../lib/api';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';

export function isStorageMissingError(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'STORAGE_OBJECT_MISSING' || err.status === 404);
}

export async function openDocumentWithFallback(
  documentId: string,
  onFallbackContent: (content: DocumentContentDTO) => void,
): Promise<void> {
  try {
    const { download_url } = await ApiClient.getDownloadUrl(documentId);
    const popup = window.open(download_url, '_blank', 'noopener,noreferrer');
    if (!popup) {
      const link = document.createElement('a');
      link.href = download_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  } catch (err) {
    if (isStorageMissingError(err)) {
      const content = await ApiClient.getDocumentContent(documentId);
      onFallbackContent(content);
      return;
    }
    throw err;
  }
}

export function DocumentReaderModal({
  content,
  onClose,
  onAskDocument,
}: {
  content: DocumentContentDTO | null;
  onClose: () => void;
  onAskDocument?: (documentId: string) => void;
}) {
  return (
    <Modal
      open={!!content}
      onClose={onClose}
      width="max-w-3xl"
      title={content?.filename || 'Document Reader'}
      description={
        content
          ? `${content.page_count || 1} page${content.page_count === 1 ? '' : 's'} • Extracted Document Text`
          : undefined
      }
      footer={
        <>
          {content && onAskDocument && (
            <Button
              variant="secondary"
              onClick={() => {
                onAskDocument(content.document_id);
                onClose();
              }}
            >
              <Icon name="chat" /> Ask AI about this file
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      {content && (
        <div className="space-y-4">
          {!content.storage_available && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-xs text-warn">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              <span>
                Showing the full extracted text stored in DocMind&apos;s index because the original binary PDF was uploaded before cloud storage was active. Ask a Company Admin to re-upload the file if raw PDF viewing is required.
              </span>
            </div>
          )}

          {content.chunks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No extracted text chunks available for this document yet.</p>
          ) : (
            <div className="scroll-thin max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {content.chunks.map(chunk => (
                <article key={chunk.chunk_index} className="rounded-xl border border-line bg-bg p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {chunk.page_start ? (
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-fg">
                        Page {chunk.page_start}
                        {chunk.page_end && chunk.page_end !== chunk.page_start ? `–${chunk.page_end}` : ''}
                      </span>
                    ) : (
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-fg">Section {chunk.chunk_index + 1}</span>
                    )}
                    {chunk.section_path && <span className="truncate text-faint">{chunk.section_path}</span>}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{chunk.content}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
