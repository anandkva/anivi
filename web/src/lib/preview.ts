import { apiUrl } from './config';
import type { Stroke } from './protocol';
import { renderStrokes } from './render';

/**
 * The widget snapshot pipeline:
 *
 *   canvas changes -> generate a small preview image -> upload it ->
 *   widgets fetch it on their next refresh.
 *
 * Only this compressed snapshot leaves the app for the widgets — never the
 * stroke history, which a widget has no way to render anyway.
 */

const PREVIEW_W = 512;
const PREVIEW_H = 320;

/** Renders the shared canvas into a small PNG. */
export async function renderPreviewBlob(strokes: Stroke[]): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = PREVIEW_W;
  canvas.height = PREVIEW_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  renderStrokes(ctx, strokes, PREVIEW_W, PREVIEW_H);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** Uploads the snapshot for this room. Failures are non-fatal by design. */
export async function uploadPreview(roomId: string, blob: Blob): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomId)}/preview`), {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Publishes a fresh snapshot for the widgets. Callers should debounce this —
 * the widgets refresh on the OS's schedule, not on every stroke.
 */
export async function publishPreview(roomId: string, strokes: Stroke[]): Promise<void> {
  const blob = await renderPreviewBlob(strokes);
  if (blob) await uploadPreview(roomId, blob);
}
