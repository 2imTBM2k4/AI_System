import React, { useState, useEffect } from 'react';
import {
  FileText,
  Save,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Info,
  Code2,
} from 'lucide-react';
import { GlassButton } from '../glass/GlassButton';
import { GlassBadge } from '../glass/GlassBadge';
import { getAgentFile, saveAgentFile, type AgentFileInfo } from '../../api/client';

export interface AgentFileEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoId: string;
  role: string;
  onSaved?: () => void;
}

export const AgentFileEditorModal: React.FC<AgentFileEditorModalProps> = ({
  isOpen,
  onClose,
  repoId,
  role,
  onSaved,
}) => {
  const [fileInfo, setFileInfo] = useState<AgentFileInfo | null>(null);
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !repoId || !role) return;

    let mounted = true;
    setLoading(true);
    setStatusMsg(null);

    getAgentFile(repoId, role)
      .then((data) => {
        if (!mounted) return;
        setFileInfo(data);
        setContent(data.content);
        setFilePath(data.filePath);
      })
      .catch((err) => {
        if (!mounted) return;
        setStatusMsg({
          type: 'error',
          text: err instanceof Error ? err.message : 'Không thể đọc thông tin file agent',
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, repoId, role]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!repoId || !role) return;
    setSaving(true);
    setStatusMsg(null);

    try {
      const res = await saveAgentFile(repoId, role, content, filePath);
      setStatusMsg({
        type: 'success',
        text: `Đã lưu thành công file ${res.filePath}!`,
      });
      if (fileInfo) {
        setFileInfo({ ...fileInfo, exists: true, filePath: res.filePath, content });
      }
      onSaved?.();
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi lưu file',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetTemplate = () => {
    const roleName = role.toUpperCase();
    const template = `---
cli: codex
model: 
duty: Chuyên viên ${role} phụ trách xử lý và thực thi task
description: Agent phụ trách vai trò ${role} trong squad
---

# Hướng dẫn nghiệp vụ cho Agent (${roleName})

## Mục tiêu
Đảm bảo các yêu cầu liên quan đến vai trò ${role} được thực thi chuẩn xác, sạch sẽ và tuân thủ cấu trúc của dự án.

## Quy tắc thực hiện
1. Đọc kỹ yêu cầu công việc được giao trong prompt.
2. Kiểm tra các file liên quan trước khi sửa đổi.
3. Chạy kiểm thử tự động (test / lint) sau khi chỉnh sửa code.
4. Báo cáo chi tiết kết quả thực hiện.
`;
    setContent(template);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="liquid-glass-card w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/15 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Cấu Hình Agent-as-Code: <span className="font-mono text-indigo-600 dark:text-indigo-400">{role}</span>
                </h3>
                {fileInfo && (
                  <GlassBadge variant={fileInfo.exists ? 'emerald' : 'amber'}>
                    {fileInfo.exists ? 'File Đã Tồn Tại' : 'Chưa Tạo File (Mẫu Sẵn)'}
                  </GlassBadge>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Định nghĩa role, model, duty và prompt chuyên sâu trong file Markdown riêng biệt
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Meta */}
        <div className="px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 font-mono text-zinc-600 dark:text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Đường dẫn file:</span>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder={`agent_${role}.md`}
              className="liquid-glass-input px-2.5 py-1 rounded-lg text-xs font-mono w-64 text-zinc-900 dark:text-zinc-200 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetTemplate}
              title="Khôi phục mẫu cấu hình Markdown chuẩn"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Nạp Mẫu Chuẩn</span>
            </GlassButton>

            <GlassButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || loading}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Đang lưu...' : 'Lưu File Markdown'}</span>
            </GlassButton>
          </div>
        </div>

        {/* Status Alert */}
        {statusMsg && (
          <div
            className={`mx-5 mt-3 p-3 rounded-xl border text-xs flex items-center gap-2 backdrop-blur-md ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-500/15 border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Helper Banner */}
        <div className="mx-5 mt-3 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/20 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold text-zinc-900 dark:text-zinc-200">
              YAML Frontmatter &amp; System Prompt:
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
              Bạn có thể đặt <code className="bg-black/[0.05] dark:bg-black/40 px-1 py-0.5 rounded font-mono text-indigo-700 dark:text-indigo-300">cli</code>, <code className="bg-black/[0.05] dark:bg-black/40 px-1 py-0.5 rounded font-mono text-indigo-700 dark:text-indigo-300">model</code>, <code className="bg-black/[0.05] dark:bg-black/40 px-1 py-0.5 rounded font-mono text-indigo-700 dark:text-indigo-300">duty</code>, <code className="bg-black/[0.05] dark:bg-black/40 px-1 py-0.5 rounded font-mono text-indigo-700 dark:text-indigo-300">description</code> ở phần header giữa 2 dấu <code className="font-mono">---</code>. Phần nội dung Markdown bên dưới sẽ được tự động tiêm vào Prompt của Agent khi thực thi task!
            </p>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 p-5 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
              <span className="text-xs font-mono">Đang đọc nội dung file agent...</span>
            </div>
          ) : (
            <div className="flex-1 flex flex-col relative rounded-xl border border-black/[0.08] dark:border-white/[0.08] overflow-hidden bg-black/[0.02] dark:bg-black/30">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5" /> Markdown &amp; Frontmatter Editor
                </span>
                <span>{content.split('\n').length} dòng • {content.length} ký tự</span>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="---&#10;cli: 9router&#10;model: ag/gemini-3.8-flash&#10;duty: Hướng dẫn chuyên sâu...&#10;---&#10;&#10;# Hướng dẫn chi tiết..."
                className="flex-1 w-full p-4 font-mono text-xs text-zinc-900 dark:text-zinc-100 bg-transparent resize-none focus:outline-none leading-relaxed selection:bg-indigo-500/20"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">
            <Info className="w-3.5 h-3.5" />
            <span>Hệ thống sẽ ưu tiên đọc: <code className="text-zinc-700 dark:text-zinc-300">agent_{role}.md</code> &gt; <code className="text-zinc-700 dark:text-zinc-300">agents/agent_{role}.md</code> &gt; <code className="text-zinc-700 dark:text-zinc-300">roles/{role}.md</code></span>
          </div>

          <div className="flex items-center gap-2">
            <GlassButton type="button" variant="ghost" size="sm" onClick={onClose}>
              Đóng
            </GlassButton>
            <GlassButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || loading}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Đang lưu...' : 'Lưu File'}</span>
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  );
};
