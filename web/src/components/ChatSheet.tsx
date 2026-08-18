import { useEffect, useRef, useState } from 'react';
import { uploadAttachment } from '../lib/api';
import type { ChatMessage } from '../lib/protocol';
import { actionsFor, stickerFor } from '../lib/stickers';
import type { Relationship } from '../lib/account';

interface Props {
  messages: ChatMessage[];
  myUserId: string;
  roomId: string;
  /** Decides which virtual actions this space offers. */
  relationship: Relationship;
  hasMore: boolean;
  loadingHistory: boolean;

  /** True while the partner is composing. */
  peerTyping: boolean;
  /** How far the partner has read, as a timestamp. */
  peerReadAt: number;
  peerName: string;
  onTyping: () => void;
  onSendText: (text: string) => void;
  onSendSticker: (stickerId: string) => void;
  onSendImage: (key: string, mime: string, size: number, caption: string) => void;
  onLoadOlder: () => void;
}

/** The conversation: text, clipart and photos, saved per room. */
export function ChatSheet({
  messages,
  myUserId,
  roomId,
  relationship,
  hasMore,
  loadingHistory,

  peerTyping,
  peerReadAt,
  peerName,
  onTyping,
  onSendText,
  onSendSticker,
  onSendImage,
  onLoadOlder,
}: Props) {
  const [draft, setDraft] = useState('');
  const [stickersOpen, setStickersOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastIdRef = useRef<string>('');

  // Follow the conversation, but only when a genuinely new message arrives —
  // loading older history must not yank the reader to the bottom.
  useEffect(() => {
    const newest = messages[messages.length - 1];
    if (!newest || newest.id === lastIdRef.current) return;
    lastIdRef.current = newest.id;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  function submitText() {
    const text = draft.trim();
    if (!text) return;
    onSendText(text);
    setDraft('');
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = await uploadAttachment(roomId, myUserId, file);
      onSendImage(uploaded.key, uploaded.mime, uploaded.size, draft.trim());
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that photo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <section className="chat-view" aria-label="Chat">
        <div className="chat-list" ref={listRef}>
          {hasMore && (
            <button className="load-older" onClick={onLoadOlder} disabled={loadingHistory}>
              {loadingHistory ? 'Loading…' : 'Load older messages'}
            </button>
          )}

          {messages.length === 0 && !loadingHistory && (
            <p className="chat-empty">
              Say something sweet ❤️
              <br />
              <span>Everything here is saved just for the two of you.</span>
            </p>
          )}

          {messages.map((msg, i) => (
            <Bubble
              key={msg.id}
              msg={msg}
              mine={msg.userId === myUserId}
              showTime={showTime(messages, i)}
              // Only the newest of your own messages carries the tick: a
              // column of "Seen" down the thread is noise.
              seen={msg.userId === myUserId && msg.createdAt <= peerReadAt && isLastMine(messages, i)}
              onOpenImage={setLightbox}
            />
          ))}

          {peerTyping && (
            <div className="bubble-row theirs" aria-live="polite">
              <div className="bubble typing-bubble">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-who">{peerName} is typing…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="error chat-error" role="alert">
            {error}
          </p>
        )}

        {stickersOpen && (
          <div className="sticker-grid" role="group" aria-label="Stickers">
            {actionsFor(relationship).map((s) => (
              <button
                key={s.id}
                className="sticker-tile"
                onClick={() => {
                  onSendSticker(s.id);
                  setStickersOpen(false);
                }}
                title={s.hint ?? s.label}
              >
                <span className={`sticker-art ${s.animation || ''}`} aria-hidden="true">
                  {s.art}
                </span>
                <span className="sticker-label">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="chat-compose">
          <button
            className={`tool ${stickersOpen ? 'active' : ''}`}
            onClick={() => setStickersOpen((v) => !v)}
            aria-label="Stickers"
            aria-pressed={stickersOpen}
          >
            💌
          </button>
          <button
            className="tool"
            onClick={() => fileRef.current?.click()}
            aria-label="Send a photo"
            disabled={uploading}
          >
            {uploading ? '⏳' : '📷'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <input
            className="chat-input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitText();
              }
            }}
            placeholder="Message…"
            aria-label="Message"
          />
          <button className="send-btn" onClick={submitText} disabled={!draft.trim()}>
            ➤
          </button>
        </div>
      </section>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Photo">
          <img src={lightbox} alt="Shared photo" />
        </div>
      )}
    </>
  );
}

function Bubble({
  msg,
  mine,
  showTime,
  seen,
  onOpenImage,
}: {
  msg: ChatMessage;
  mine: boolean;
  showTime: boolean;
  seen: boolean;
  onOpenImage: (url: string) => void;
}) {
  const sticker = msg.kind === 'sticker' ? stickerFor(msg.sticker) : null;

  return (
    <div className={`bubble-row ${mine ? 'mine' : 'theirs'}`}>
      <div
        className={[
          'bubble',
          sticker ? 'bubble-sticker' : '',
          msg.kind === 'image' ? 'bubble-image' : '',
          msg.pending ? 'pending' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {sticker && (
          <>
            <span className={`bubble-art ${sticker.animation || ''}`} aria-hidden="true">
              {sticker.art}
            </span>
            <span className="bubble-art-label">{sticker.label}</span>
          </>
        )}

        {msg.kind === 'image' && msg.attachment?.url && (
          <img
            className="bubble-photo"
            src={msg.attachment.url}
            alt={msg.text || 'Shared photo'}
            loading="lazy"
            onClick={() => onOpenImage(msg.attachment!.url)}
          />
        )}

        {msg.text && msg.kind !== 'sticker' && <p className="bubble-text">{msg.text}</p>}

        {showTime && (
          <span className="bubble-time">
            {clock(msg.createdAt)}
            {mine && (msg.pending ? ' ·' : seen ? ' ✓✓' : ' ✓')}
          </span>
        )}
      </div>
    </div>
  );
}

/** Whether this is the newest message you sent. */
function isLastMine(messages: ChatMessage[], i: number): boolean {
  for (let j = messages.length - 1; j >= 0; j--) {
    if (messages[j].userId === messages[i].userId) return j === i;
  }
  return false;
}

/** Timestamps only where they help: the last of a burst, or a gap in time. */
function showTime(messages: ChatMessage[], i: number): boolean {
  const msg = messages[i];
  const next = messages[i + 1];
  if (!next) return true;
  if (next.userId !== msg.userId) return true;
  return next.createdAt - msg.createdAt > 5 * 60 * 1000;
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
