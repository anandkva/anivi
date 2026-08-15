import { useCallback, useEffect, useRef } from 'react';
import type { Point, Stroke, Tool } from '../lib/protocol';
import { drawStroke, renderStrokes } from '../lib/render';

/**
 * How often an in-progress stroke is streamed to the partner. Every update
 * carries the same stroke id and the points so far, so the server and the
 * partner upsert rather than accumulate. ~12 updates/second reads as live
 * without flooding the socket.
 */
const STREAM_INTERVAL_MS = 80;

/** Points closer than this (normalized) are dropped as pointer jitter. */
const MIN_POINT_DISTANCE = 0.0015;

interface Props {
  strokes: Stroke[];
  tool: Tool;
  color: string;
  width: number;
  userId: string;
  /** Called while drawing and once more when the stroke is finished. */
  onStroke: (stroke: Stroke, done: boolean) => void;
}

/** The shared canvas. Both partners draw on it at the same time. */
export function Canvas({ strokes, tool, color, width, userId, onStroke }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const liveRef = useRef<Stroke | null>(null);
  const lastSentRef = useRef(0);
  // Drawing reads these through refs so a tool change never interrupts a
  // stroke in progress.
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(width);
  toolRef.current = tool;
  colorRef.current = color;
  widthRef.current = width;

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;
    renderStrokes(ctx, strokes, w, h);
    // The stroke under the finger sits on top of the replayed history.
    if (liveRef.current) drawStroke(ctx, liveRef.current, w, h);
  }, [strokes]);

  // Keep the backing store at device resolution so strokes stay crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = parent.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (w === sizeRef.current.w && h === sizeRef.current.h) return;
      canvas.width = w;
      canvas.height = h;
      sizeRef.current = { w, h };
      repaint();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [repaint]);

  useEffect(repaint, [repaint]);

  function toNormalized(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    // Ignore anything that isn't a primary press (right-click, extra fingers).
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    liveRef.current = {
      id: `stroke_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
      userId,
      tool: toolRef.current,
      color: colorRef.current,
      width: widthRef.current,
      points: [toNormalized(e)],
    };
    lastSentRef.current = 0;
    repaint();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const live = liveRef.current;
    if (!live) return;

    // Coalesced events recover the samples the browser batched into this
    // frame. Some browsers (and any synthetic event) return an empty list, so
    // the event itself is the fallback — otherwise the move is lost.
    const coalesced =
      typeof e.nativeEvent.getCoalescedEvents === 'function'
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    const events = coalesced.length > 0 ? coalesced : [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();

    let added = false;
    for (const ev of events) {
      const p = {
        x: clamp01((ev.clientX - rect.left) / rect.width),
        y: clamp01((ev.clientY - rect.top) / rect.height),
      };
      const prev = live.points[live.points.length - 1];
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < MIN_POINT_DISTANCE) continue;
      live.points.push(p);
      added = true;
    }
    if (!added) return;

    drawSegment(live);

    const now = performance.now();
    if (now - lastSentRef.current >= STREAM_INTERVAL_MS) {
      lastSentRef.current = now;
      onStroke(cloneStroke(live), false);
    }
  }

  function endStroke() {
    const live = liveRef.current;
    if (!live) return;
    liveRef.current = null;
    onStroke(cloneStroke(live), true);
    // The parent adds the finished stroke to history, which repaints it with
    // the smoothed path.
  }

  /**
   * Draws only the newest segment instead of repainting everything, so a fast
   * scribble stays at pointer speed. The smoothed version appears when the
   * stroke lands in history.
   */
  function drawSegment(live: Stroke) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    const tail = live.points.slice(-2);
    if (tail.length === 0) return;
    drawStroke(ctx, { ...live, points: tail }, w, h);
  }

  return (
    <canvas
      ref={canvasRef}
      className="canvas"
      // The canvas owns every gesture inside it: no scrolling, no pull to
      // refresh, no double-tap zoom while drawing.
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={endStroke}
      aria-label="Shared drawing canvas"
      role="img"
    />
  );
}

function cloneStroke(s: Stroke): Stroke {
  return { ...s, points: s.points.map((p) => ({ ...p })) };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
