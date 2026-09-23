import React, { useState, useMemo } from 'react';
import {
  FileText,
  X,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Code2,
  Eye,
  Terminal,
} from 'lucide-react';
import { marked } from 'marked';

interface MarkdownPreviewDrawerProps {
  title: string;
  content: string;
  filePath?: string;
  onClose: () => void;
  width?: number;
  mode?: 'docked' | 'fixed';
  // Optional tabs integration with terminal
  activeTab?: 'terminal' | 'markdown';
  onTabChange?: (tab: 'terminal' | 'markdown') => void;
  hasTerminalLog?: boolean;
}

export const MarkdownPreviewDrawer: React.FC<MarkdownPreviewDrawerProps> = ({
  title,
  content,
  filePath,
  onClose,
  width = 480,
  mode = 'docked',
  activeTab = 'markdown',
  onTabChange,
  hasTerminalLog = false,
}) => {
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Parse markdown into HTML safely using marked
  const renderedHtml = useMemo(() => {
    try {
      return marked.parse(content || '*Không có nội dung hiển thị*', {
        gfm: true,
        breaks: true,
      }) as string;
    } catch {
      return `<pre class="text-rose-500 font-mono text-xs">Lỗi hiển thị Markdown.</pre>`;
    }
  }, [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isFixed = mode === 'fixed';

  return (
    <>
      {/* Backdrop: Only on mobile or in fixed mode */}
      <div
        className={
          isFixed
            ? 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200'
            : 'fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-200'
        }
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        style={
          isExpanded
            ? { width: '100vw' }
            : !isFixed && typeof width === 'number'
            ? { width: `${width}px` }
            : undefined
        }
        className={
          isExpanded
            ? 'fixed inset-0 z-50 bg-[var(--card-bg)] flex flex-col shadow-2xl transition-all duration-200 animate-in fade-in'
            : isFixed
            ? 'fixed top-0 right-0 h-full w-full sm:w-[480px] md:w-[560px] z-50 bg-[var(--card-bg)] border-l border-[var(--color-warm-mist)] flex flex-col shadow-2xl transition-all duration-200 animate-in slide-in-from-right'
            : 'fixed md:relative top-0 right-0 h-full w-full sm:w-[480px] md:w-auto z-40 md:z-10 bg-[var(--card-bg)] border-l border-[var(--color-warm-mist)] flex flex-col shadow-2xl md:shadow-none shrink-0 transition-[width] duration-75 animate-in slide-in-from-right md:animate-none'
        }
      >
        {/* Header */}
        <div className="h-14 px-4 border-b border-[var(--color-warm-mist)] flex items-center justify-between gap-3 bg-[var(--color-parchment)]/60 dark:bg-black/20 shrink-0">
          {/* Title & Tabs */}
          <div className="flex items-center gap-2 min-w-0">
            {hasTerminalLog && onTabChange ? (
              <div className="flex items-center p-0.5 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg border border-[var(--color-warm-mist)]">
                <button
                  type="button"
                  onClick={() => onTabChange('terminal')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    activeTab === 'terminal'
                      ? 'bg-[var(--card-bg)] text-[var(--color-deep-teal)] shadow-sm font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Chuyển sang xem Terminal Log"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Terminal</span>
                </button>

                <button
                  type="button"
                  onClick={() => onTabChange('markdown')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    activeTab === 'markdown'
                      ? 'bg-[var(--card-bg)] text-[var(--color-deep-teal)] shadow-sm font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title="Chuyển sang xem Markdown Preview"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Markdown</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[var(--color-deep-teal)]/10 text-[var(--color-deep-teal)] flex items-center justify-center shrink-0 border border-[var(--color-deep-teal)]/20">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate font-mono">
                    {title}
                  </h3>
                  {filePath && (
                    <p className="text-[10px] text-[var(--text-muted)] truncate font-mono">
                      {filePath}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {/* View Mode Toggle: Preview vs Raw */}
            <div className="flex items-center p-0.5 bg-black/[0.04] dark:bg-white/[0.06] rounded-lg border border-[var(--color-warm-mist)] mr-1">
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`p-1 px-1.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'preview'
                    ? 'bg-[var(--card-bg)] text-[var(--color-deep-teal)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                title="Chế độ Xem trước (Rendered)"
              >
                <Eye className="w-3 h-3" />
                <span className="hidden sm:inline">Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={`p-1 px-1.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'raw'
                    ? 'bg-[var(--card-bg)] text-[var(--color-deep-teal)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
                title="Chế độ Mã nguồn Markdown (Raw)"
              >
                <Code2 className="w-3 h-3" />
                <span className="hidden sm:inline">Raw</span>
              </button>
            </div>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Sao chép toàn bộ nội dung Markdown"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Fullscreen toggle */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer hidden md:flex"
              title={isExpanded ? 'Thu nhỏ' : 'Mở rộng toàn màn hình'}
            >
              {isExpanded ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Đóng bảng Preview"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[var(--card-bg)]">
          {viewMode === 'preview' ? (
            <div
              className="markdown-preview prose prose-sm dark:prose-invert max-w-none space-y-3 text-[var(--text-primary)] font-sans text-xs md:text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          ) : (
            <pre className="p-4 rounded-xl bg-black/[0.03] dark:bg-black/40 border border-[var(--color-warm-mist)] font-mono text-xs leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap select-text">
              {content}
            </pre>
          )}
        </div>

        {/* Footer info bar */}
        <div className="h-8 px-4 border-t border-[var(--color-warm-mist)] flex items-center justify-between text-[11px] text-[var(--text-muted)] bg-[var(--color-parchment)]/30 dark:bg-black/10 shrink-0 font-mono">
          <span>{content.length.toLocaleString()} ký tự</span>
          <span>{viewMode === 'preview' ? 'HTML Rendered' : 'Raw Text'}</span>
        </div>
      </aside>
    </>
  );
};
