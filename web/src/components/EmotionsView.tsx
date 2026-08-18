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
  onSend,
}: Props) {
  const actions = useMemo(() => actionsFor(relationship), [relationship]);

  // Newest first: the last thing that happened is the thing you came to see.
  const history = useMemo(() => [...emotions].reverse(), [emotions]);

  // How many of each you have exchanged, all time — the shape of a
  // relationship in one line.
  const tally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of emotions) {
      if (!e.sticker) continue;
      counts.set(e.sticker, (counts.get(e.sticker) ?? 0) + 1);
    }
    return counts;
  }, [emotions]);

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
              <span className="emotion-count" aria-label={`${tally.get(a.id)} so far`}>
                {tally.get(a.id)}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="emotion-history">
        <p className="emotion-history-title">
          {history.length > 0 ? 'Between you two' : ''}
        </p>

        {loading && history.length === 0 && <p className="chat-empty">Loading…</p>}

        {!loading && history.length === 0 && (
          <p className="chat-empty">
            Nothing yet ❤️
            <br />
            <span>Tap one above — {peerName} gets it right away.</span>
          </p>
        )}

        <ul className="emotion-list">
          {history.map((e) => {
            const sticker = stickerFor(e.sticker);
            const mine = e.userId === myUserId;
            return (
              <li key={e.id} className={`emotion-row ${mine ? 'mine' : 'theirs'}`}>
                <span className={`emotion-row-art ${sticker.animation ?? ''}`} aria-hidden="true">
                  {sticker.art}
                </span>
                <span className="emotion-row-body">
                  <span className="emotion-row-label">{sticker.label}</span>
                  <span className="emotion-row-who">
                    {mine ? 'You sent' : `${peerName} sent`} · {relative(e.createdAt)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
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
