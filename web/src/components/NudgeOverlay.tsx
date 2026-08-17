import { useEffect, useRef, useState } from 'react';
import { stickerFor } from '../lib/stickers';

/**
 * The two halves of a shared sticker.
 *
 * `asking`  — your partner tapped Hug and is waiting for you.
 * `waiting` — you tapped it and nobody has answered yet.
 * `match`   — you both sent the same one: the hug actually happens.
 */
export type NudgeState =
  | { phase: 'idle' }
  | { phase: 'asking'; sticker: string; label: string; at: number }
  | { phase: 'waiting'; sticker: string; label: string; at: number }
  | { phase: 'match'; sticker: string; label: string; at: number };

/** How long the "they're waiting for you" card stays up before it fades. */
const ASK_TIMEOUT_MS = 30_000;
/** How long "sent, waiting for them" stays up. */
const WAIT_TIMEOUT_MS = 12_000;
/** The match animation's length; the CSS timings below match it. */
const MATCH_MS = 2600;

interface Props {
  state: NudgeState;
  /** Answers the partner's invitation with the same sticker. */
  onAnswer: (stickerId: string) => void;
  onDismiss: () => void;
}

export function NudgeOverlay({ state, onAnswer, onDismiss }: Props) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const [tick, setTick] = useState(0);

  // Each phase clears itself, and the timer is keyed on the moment the phase
  // started so a second nudge restarts it rather than inheriting a stale one.
  useEffect(() => {
    if (state.phase === 'idle') return;
    const ms =
      state.phase === 'match' ? MATCH_MS : state.phase === 'waiting' ? WAIT_TIMEOUT_MS : ASK_TIMEOUT_MS;
    const timer = window.setTimeout(() => onDismissRef.current(), ms);
    return () => window.clearTimeout(timer);
  }, [state.phase, state.phase === 'idle' ? 0 : state.at]);

  // Re-render once a second so the "asking" card can count down.
  useEffect(() => {
    if (state.phase !== 'asking') return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [state.phase]);

  if (state.phase === 'idle') return null;

  const sticker = stickerFor(state.sticker);

  if (state.phase === 'match') {
    return (
      <div className="nudge-match" role="status" aria-live="polite">
        {/* The two of you, arriving from opposite sides. */}
        <div className="match-stage">
          <span className="match-art from-left" aria-hidden="true">
            {sticker.art}
          </span>
          <span className="match-art from-right" aria-hidden="true">
            {sticker.art}
          </span>
          <span className="match-burst" aria-hidden="true">
            ❤️
          </span>
        </div>
        <p className="match-text">{state.label || sticker.label} 💞</p>
        <p className="match-sub">Both of you, at the same time</p>
      </div>
    );
  }

  if (state.phase === 'waiting') {
    return (
      <div className="nudge-chip waiting" role="status">
        <span className={`nudge-chip-art ${sticker.animation ?? ''}`} aria-hidden="true">
          {sticker.art}
        </span>
        <span>Sent — waiting for them…</span>
      </div>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((ASK_TIMEOUT_MS - (Date.now() - state.at)) / 1000));
  void tick; // the countdown above is what this re-render is for

  return (
    <div className="nudge-ask" role="alertdialog" aria-label={`${state.label} from your partner`}>
      <span className={`nudge-ask-art ${sticker.animation ?? ''}`} aria-hidden="true">
        {sticker.art}
      </span>
      <div className="nudge-ask-body">
        <p className="nudge-ask-title">{state.label || sticker.label}</p>
        <p className="nudge-ask-sub">They&rsquo;re waiting for you · {secondsLeft}s</p>
      </div>
      <button className="nudge-answer" onClick={() => onAnswer(state.sticker)}>
        Send back
      </button>
      <button className="nudge-close" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
