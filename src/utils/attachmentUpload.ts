import type { Attachment } from '../types/business';

function todayText() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function formatAttachmentSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function attachmentsFromFileList(files: FileList | null, uploader = '当前用户'): Attachment[] {
  return Array.from(files ?? []).map((file) => ({
    name: file.name,
    size: formatAttachmentSize(file.size),
    uploader,
    date: todayText(),
  }));
}
