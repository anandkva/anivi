import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Changes every time a heart arrives, which restarts the animation. */
  token: number;
  onDone: () => void;
}

/** The full-screen "they miss you" moment. */
export function MissYouOverlay({ token, onDone }: Props) {
  const [hearts, setHearts] = useState<{ id: number; left: number; delay: number }[]>([]);
  // Held in a ref so a re-render of the space (presence, a partner's stroke)
  // cannot restart the dismiss timer and leave the overlay hanging around.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (token === 0) return;
    setHearts(
      Array.from({ length: 9 }, (_, i) => ({
        id: token * 100 + i,
        left: 8 + Math.random() * 84,
        delay: Math.random() * 0.5,
      })),
    );
    const timer = window.setTimeout(() => onDoneRef.current(), 2600);
    return () => window.clearTimeout(timer);
  }, [token]);

  if (token === 0) return null;

  return (
    <div className="miss-overlay" role="status" aria-live="polite">
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
        <p className="miss-text">They miss you!</p>
      </div>
    </div>
  );
}
