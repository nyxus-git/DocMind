'use client';

import React, { useState } from 'react';
import { ApiClient, CitationDTO, DocumentContentDTO } from '../../lib/api';
import { Button, Spinner } from '../ui/Button';
import { Drawer } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { DocumentReaderModal, isStorageMissingError, openDocumentWithFallback } from './DocumentReaderModal';

export function CitationDrawer({
  citation,
  onClose,
  onAskDocument,
}: {
  citation: CitationDTO | null;
  onClose: () => void;
  onAskDocument: (docId: string) => void;
}) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [readerContent, setReaderContent] = useState<DocumentContentDTO | null>(null);

  const openSource = async () => {
    if (!citation) return;
    setOpening(true);
    try {
      await openDocumentWithFallback(citation.document_id, content => {
        setReaderContent(content);
        toast('Original PDF binary missing — opened extracted text reader.', 'info');
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open the source file.', 'error');
    } finally {
      setOpening(false);
    }
  };

  const togglePreview = async () => {
    if (!citation) return;
    if (previewUrl && previewDocId === citation.document_id) {
      setPreviewUrl(null);
      setPreviewDocId(null);
      return;
    }
    setOpening(true);
    try {
      const { download_url } = await ApiClient.getDownloadUrl(citation.document_id);
      const pageAnchor = citation.page_start ? `#page=${citation.page_start}` : '';
      setPreviewUrl(`${download_url}${pageAnchor}`);
      setPreviewDocId(citation.document_id);
    } catch (err) {
      if (isStorageMissingError(err)) {
        try {
          const content = await ApiClient.getDocumentContent(citation.document_id);
          setReaderContent(content);
          toast('Original PDF binary missing — opened extracted text reader.', 'info');
          return;
        } catch {
          // fall through to toast
        }
      }
      toast(err instanceof Error ? err.message : 'Could not load document preview.', 'error');
    } finally {
      setOpening(false);
    }
  };

  const showingPreview = Boolean(citation && previewUrl && previewDocId === citation.document_id);

  return (
    <>
    <Drawer
      open={!!citation}
      onClose={() => {
        setPreviewUrl(null);
        setPreviewDocId(null);
        onClose();
      }}
      title="Source"
      footer={
        citation && !citation.is_source_deleted ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={togglePreview} disabled={opening}>
              {opening ? <Spinner className="size-3.5" /> : <Icon name="book" />}
              {showingPreview ? 'Show passage' : 'Preview PDF'}
            </Button>
            <Button variant="secondary" size="sm" onClick={openSource} disabled={opening}>
              <Icon name="external" />
              Open in tab
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onAskDocument(citation.document_id);
                onClose();
              }}
            >
              <Icon name="chat" />
              Ask about this document
            </Button>
          </div>
        ) : undefined
      }
    >
      {citation && (
        <div className="p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex min-w-[1.5rem] items-center justify-center rounded-md bg-mark px-1.5 py-0.5 text-xs font-bold text-[#1a1400]">
              {citation.source_label.replace(/^S/i, '')}
            </span>
            <div className="min-w-0">
              <p className="break-words text-[15px] font-semibold leading-6">{citation.filename}</p>
              <p className="tabular mt-0.5 text-sm text-muted">
                {citation.page_start
                  ? citation.page_end && citation.page_end !== citation.page_start
                    ? `Pages ${citation.page_start} to ${citation.page_end}`
                    : `Page ${citation.page_start}`
                  : 'No page number'}
                {citation.section ? ` • ${citation.section}` : ''}
              </p>
            </div>
          </div>

          {showingPreview && previewUrl ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-line bg-bg">
              <iframe title={citation.filename} src={previewUrl} className="h-[28rem] w-full" />
            </div>
          ) : (
            <div className="mt-5 rounded-lg bg-surface-2 p-3">
              <div className="rounded-[3px] bg-paper px-5 py-5 font-serif text-[15px] leading-[1.8] text-paper-fg shadow-page">
                <span className="mark-strong">{citation.excerpt}</span>
              </div>
              <p className="mt-2 px-1 text-xs text-muted">Passage as it appears in the document.</p>
            </div>
          )}

          {citation.is_source_deleted && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-warn-soft px-3.5 py-3 text-sm text-warn">
              <Icon name="alert" className="mt-0.5 size-4" />
              <span>This document has been deleted. The passage is kept so the earlier answer can still be checked.</span>
            </div>
          )}
        </div>
      )}
    </Drawer>
    <DocumentReaderModal
      content={readerContent}
      onClose={() => setReaderContent(null)}
      onAskDocument={docId => {
        onAskDocument(docId);
        onClose();
      }}
    />
  </>
  );
}
