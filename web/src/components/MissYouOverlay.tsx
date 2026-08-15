import { useEffect, useRef, useState } from 'react';

/**
 * `received` — a heart arrived: the full moment, dimming the canvas.
 * `sent`     — you pressed the button: a lighter burst that confirms it left,
 *              without covering the canvas you may still be drawing on.
 */
export type MissYouKind = 'received' | 'sent';

interface Props {
  /** Changes every time a heart happens, which restarts the animation. */
  token: number;
  kind: MissYouKind;
  onDone: () => void;
}

const DURATION_MS: Record<MissYouKind, number> = {
  received: 2600,
  sent: 1500,
};

const HEART_COUNT: Record<MissYouKind, number> = {
  received: 9,
  sent: 6,
};

/** The Miss You moment, on both sides of it. */
export function MissYouOverlay({ token, kind, onDone }: Props) {
  const [hearts, setHearts] = useState<{ id: number; left: number; delay: number }[]>([]);
  // Held in a ref so a re-render of the space (presence, a partner's stroke)
  // cannot restart the dismiss timer and leave the overlay hanging around.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (token === 0) return;
    setHearts(
      Array.from({ length: HEART_COUNT[kind] }, (_, i) => ({
        id: token * 100 + i,
        // The sender's hearts rise from around the button; the receiver's fill
        // the whole screen.
        left: kind === 'sent' ? 30 + Math.random() * 40 : 8 + Math.random() * 84,
        delay: Math.random() * (kind === 'sent' ? 0.25 : 0.5),
      })),
    );
    const timer = window.setTimeout(() => onDoneRef.current(), DURATION_MS[kind]);
    return () => window.clearTimeout(timer);
  }, [token, kind]);

  if (token === 0) return null;

  return (
    <div className={`miss-overlay ${kind}`} role="status" aria-live="polite">
      {hearts.map((h) => (
        <span
          key={h.id}
          className="floating-heart"
          style={{ left: `${h.left}%`, animationDelay: `${h.delay}s` }}
          aria-hidden="true"
        >
          ❤️
        </span>
      ))}
      <div className="miss-card">
        <div className="miss-heart" aria-hidden="true">
          ❤️
        </div>
        <p className="miss-text">{kind === 'sent' ? 'Sent with love' : 'They miss you!'}</p>
      </div>
    </div>
  );
}
