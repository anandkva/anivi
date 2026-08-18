import { useMemo } from 'react';
import type { ChatMessage } from '../lib/protocol';
import type { Relationship } from '../lib/account';
import { actionsFor, stickerFor } from '../lib/stickers';

interface Props {
  emotions: ChatMessage[];
  myUserId: string;
  peerName: string;
  relationship: Relationship;
  loading: boolean;
  /** Anything received after this is something this device hasn't seen. */
  missedSince: number;
  onSend: (stickerId: string) => void;
}

/**
 * The Emotions tab.
 *
 * Sending is the top half — big, animated tiles, because tapping one should
 * feel like doing something rather than picking from a menu. The bottom half
 * is what has already passed between the two of you: emotions are kept, so a
 * hug you missed while your phone was in your pocket is still there.
 */
export function EmotionsView({
  emotions,
  myUserId,
  peerName,
  relationship,
  loading,
  missedSince,
  onSend,
}: Props) {
  const actions = useMemo(() => actionsFor(relationship), [relationship]);

  /**
   * What you missed — not a log.
   *
   * Only emotions the other person sent after this device last opened the
   * tab. Your own are never here (you cannot miss something you sent), and
   * once you have seen them they do not come back on the next visit.
   */
  const missed = useMemo(
    () =>
      emotions
        .filter((e) => e.userId !== myUserId && e.createdAt > missedSince)
        .reverse(),
    [emotions, myUserId, missedSince],
  );

  /**
   * How many of each you missed, counted per
   * emotion. Not an all-time tally: the number on a tile answers "what am I
   * coming back to", and it clears once you have seen them.
   */
  const tally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of missed) {
      if (!e.sticker) continue;
      counts.set(e.sticker, (counts.get(e.sticker) ?? 0) + 1);
    }
    return counts;
  }, [missed]);

  const missedGroups = useMemo(() => {
    const latest = new Map<string, ChatMessage>();
    for (const e of missed) {
      if (!e.sticker) continue;
      if (!latest.has(e.sticker)) latest.set(e.sticker, e);
    }
    return Array.from(latest.values());
  }, [missed]);

  return (
    <section className="emotions-view" aria-label="Emotions">
      <div className="emotion-pad" role="group" aria-label="Send an emotion">
        {actions.map((a, i) => (
          <button
            key={a.id}
            className="emotion-tile"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => onSend(a.id)}
            title={a.hint ?? a.label}
          >
            <span className={`emotion-art ${a.animation ?? ''}`} aria-hidden="true">
              {a.art}
            </span>
            <span className="emotion-label">{a.label}</span>
            {(tally.get(a.id) ?? 0) > 0 && (
              <span className="emotion-count" aria-label={`${tally.get(a.id)} missed`}>
                {tally.get(a.id)}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="emotion-history">
        {missed.length > 0 && (
          <div className="emotion-missed-head" aria-live="polite">
            <span className="emotion-history-title">Missed from {peerName}</span>
            <span className="emotion-missed-total">{missed.length}</span>
          </div>
        )}

        {loading && missed.length === 0 && <p className="chat-empty">Loading…</p>}

        {!loading && missed.length === 0 && (
          <p className="chat-empty">
            Nothing missed ❤️
            <br />
            <span>Tap one above — {peerName} gets it right away.</span>
          </p>
        )}

        {missedGroups.length > 0 && (
          <div className="emotion-missed-strip" aria-label="Missed emotions">
            {missedGroups.map((e, i) => {
              const sticker = stickerFor(e.sticker);
              return (
                <button
                  key={sticker.id}
                  className="emotion-missed"
                  style={{ animationDelay: `${i * 70}ms` }}
                  onClick={() => onSend(sticker.id)}
                  title={`Send ${sticker.label} back`}
                >
                  <span className={`emotion-row-art ${sticker.animation ?? ''}`} aria-hidden="true">
                    {sticker.art}
                  </span>
                  <span className="emotion-row-body">
                    <span className="emotion-row-label">{sticker.label}</span>
                    <span className="emotion-row-who">{relative(e.createdAt)}</span>
                  </span>
                  {(tally.get(sticker.id) ?? 0) > 1 && (
                    <span className="emotion-missed-count">x{tally.get(sticker.id)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function relative(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(ts).toLocaleDateString();
}
