import type { Stroke } from './protocol';

/**
 * Stroke rendering shared by the live canvas and the widget snapshot, so the
 * Home Screen preview looks like what the couple actually drew.
 */

export const CANVAS_BG = '#fffafc';

/** Draws one stroke into a context sized w x h (device pixels). */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
): void {
  if (stroke.points.length === 0) return;

  const scale = Math.min(w, h);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, stroke.width * scale);

  if (stroke.tool === 'eraser') {
    // The eraser is part of the history, so replaying strokes in order
    // reproduces the canvas exactly.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color;
  }

  const pts = stroke.points;
  if (pts.length === 1) {
    // A tap is a dot, not a zero-length line.
    const p = pts[0];
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x * w, pts[0].y * h);
  // Quadratic segments through midpoints smooth out the raw pointer samples.
  for (let i = 1; i < pts.length - 1; i++) {
    const cur = pts[i];
    const next = pts[i + 1];
    ctx.quadraticCurveTo(
      cur.x * w,
      cur.y * h,
      ((cur.x + next.x) / 2) * w,
      ((cur.y + next.y) / 2) * h,
    );
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x * w, last.y * h);
  ctx.stroke();
  ctx.restore();
}

/** Repaints the whole canvas from history. */
export function renderStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Iterable<Stroke>,
  w: number,
  h: number,
  background: string | null = CANVAS_BG,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  for (const stroke of strokes) drawStroke(ctx, stroke, w, h);
}
