import { apiUrl } from './config';
import type { Activity, Stroke } from './protocol';
import { renderStrokes } from './render';

/**
 * The Home Screen widget card.
 *
 * Widgets cannot hold a WebSocket open, so Anivi does the opposite of live
 * rendering: whenever the shared canvas or the activity changes, the open app
 * composes one small image of the couple's latest state and uploads it. Every
 * widget surface — an iOS Scriptable widget, an Android image widget, the
 * /widget page — then just shows that image.
 *
 *   canvas changes -> compose card -> upload -> widget refreshes on its own schedule
 */

const CARD_W = 600;
const CARD_H = 400;

export interface CardInput {
  strokes: Stroke[];
  activity: Activity | null;
  online: number;
}

/** Composes the card exactly as the widget should look. */
export async function renderCardBlob({ strokes, activity, online }: CardInput): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#fff5f8');
  bg.addColorStop(1, '#ffe2ec');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const font = (size: number, weight = '600') =>
    `${weight} ${size}px ui-rounded, -apple-system, "Segoe UI", Roboto, sans-serif`;

  // Header
  ctx.fillStyle = '#e8386c';
  ctx.font = font(30, '700');
  ctx.textBaseline = 'middle';
  ctx.fillText('❤️ Anivi', 28, 44);

  if (online > 1) {
    ctx.font = font(20);
    ctx.fillStyle = '#3aa76d';
    ctx.textAlign = 'right';
    ctx.fillText('🟢 together', CARD_W - 28, 44);
    ctx.textAlign = 'left';
  }

  // Drawing preview panel
  const panel = { x: 28, y: 76, w: CARD_W - 56, h: 200, r: 22 };
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, panel.r);
  ctx.fillStyle = '#fffafc';
  ctx.fill();

  if (strokes.length > 0) {
    // Render the canvas separately, then clip it into the panel so strokes
    // never bleed over the rounded corners.
    const inner = document.createElement('canvas');
    inner.width = panel.w;
    inner.height = panel.h;
    const innerCtx = inner.getContext('2d');
    if (innerCtx) {
      renderStrokes(innerCtx, strokes, panel.w, panel.h, null);
      ctx.save();
      roundRect(ctx, panel.x, panel.y, panel.w, panel.h, panel.r);
      ctx.clip();
      ctx.drawImage(inner, panel.x, panel.y);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#e3bfcd';
    ctx.font = font(24);
    ctx.textAlign = 'center';
    ctx.fillText('Draw together ❤️', CARD_W / 2, panel.y + panel.h / 2);
    ctx.textAlign = 'left';
  }

  // Activity line
  ctx.fillStyle = '#2b2440';
  ctx.font = font(28, '700');
  ctx.fillText(truncate(ctx, activityLine(activity), CARD_W - 160), 28, 316);

  // A wall-clock time instead of "2 min ago": the card is a still image, and
  // a relative time would start lying the moment it is uploaded.
  if (activity?.timestamp) {
    ctx.fillStyle = '#8d8199';
    ctx.font = font(20);
    ctx.textAlign = 'right';
    ctx.fillText(clockTime(activity.timestamp), CARD_W - 28, 316);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = '#e8386c';
  ctx.font = font(22);
  ctx.fillText('Open Anivi →', 28, 362);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Uploads the composed card. Failures are non-fatal — the widget keeps the old one. */
export async function uploadCard(roomId: string, blob: Blob): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomId)}/card`), {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function publishCard(roomId: string, input: CardInput): Promise<void> {
  const blob = await renderCardBlob(input);
  if (blob) await uploadCard(roomId, blob);
}

function activityLine(activity: Activity | null): string {
  if (!activity?.text) return 'Your space is ready ❤️';
  return activity.kind === 'miss_you' ? '❤️ They miss you' : activity.text;
}

function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
