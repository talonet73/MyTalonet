import type { MediaAsset } from '../types/editor';
export async function importMediaFile(file: File): Promise<MediaAsset> {
  const response = await fetch('/api/upload-media', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) }, body: file });
  const result = await response.json();
  if (!response.ok || !result.success || !result.asset) throw new Error(result.error || `Importazione fallita: ${file.name}`);
  return result.asset;
}
