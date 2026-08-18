import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from './Canvas';
import { ChatSheet } from './ChatSheet';
import { EmotionsView } from './EmotionsView';
import { NudgeOverlay, type NudgeState } from './NudgeOverlay';
import { SettingsSheet } from './SettingsSheet';
import { fetchHistory } from '../lib/api';
import { API_URL } from '../lib/config';
import { publishPreview } from '../lib/preview';
import { publishCard } from '../lib/widgetCard';
import { PEN_COLORS, type Activity, type ChatMessage, type Stroke, type Tool } from '../lib/protocol';
import { AniviSocket, type ConnectionStatus } from '../lib/socket';
import { stickerFor } from '../lib/stickers';
import { buzz, playHeartChime, playSentBlip, unlockSound } from '../lib/sound';
import type { Account, Connection } from '../lib/account';
import { enablePush, pushState, syncPushSubscription } from '../lib/notifications';
import { lastEmotionsSeenAt, markEmotionsSeen } from '../lib/storage';

/** The canvas snapshot is republished at most this often. */
const PREVIEW_DEBOUNCE_MS = 2500;

const PEN_WIDTHS = [
  { label: 'S', value: 0.004 },
  { label: 'M', value: 0.008 },
  { label: 'L', value: 0.016 },
];

const RELATIONSHIP_BADGE = {
  partner: '❤️ Partner',
  friend: '👥 Friend',
  family: '🏠 Family',
} as const;

interface Props {
  account: Account;
  connection: Connection;
  onBack: () => void;
  onDisconnected: () => void;
}

/**
 * One shared space: chat, a board, and the virtual actions that belong to this
 * relationship. Everything here is scoped to a single connection's room.
 */
export function SpaceScreen({ account, connection, onBack, onDisconnected }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [online, setOnline] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lost, setLost] = useState(false);

  type Tab = 'emotions' | 'chat' | 'board';
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [emotions, setEmotions] = useState<ChatMessage[]>([]);
  const [loadingEmotions, setLoadingEmotions] = useState(false);
  const [emotionNudge, setEmotionNudge] = useState(0);
  /** Everything received after this is something this device hasn't seen. */
  const [missedSince, setMissedSince] = useState(0);
  // Ephemeral, both ways: what the partner is doing right now.
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerReadAt, setPeerReadAt] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [unread, setUnread] = useState(0);
  const [boardNudge, setBoardNudge] = useState(false);
  const [nudge, setNudge] = useState<NudgeState>({ phase: 'idle' });
  // Asked for once, the first time this device sends something: permission
  // prompts land better right after you did something than on arrival.
  const [offerPush, setOfferPush] = useState(false);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PEN_COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[1].value);

  // Read inside socket callbacks, which capture the first render's values.
  const activeTabRef = useRef<Tab>('chat');
  activeTabRef.current = activeTab;
  const typingTimerRef = useRef<number | null>(null);
  const typingSentRef = useRef(false);

  const socketRef = useRef<AniviSocket | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;
  const activityRef = useRef<Activity | null>(null);
  const onlineRef = useRef(0);
  onlineRef.current = online;

  if (socketRef.current === null) socketRef.current = new AniviSocket();
  const socket = socketRef.current;

  const { roomId, relationship, peerName } = connection;

  /**
   * Publishes what the Home Screen widgets read: the bare canvas snapshot and
   * the composed card. Widgets never connect to the socket.
   */
  const publishWidgetState = useCallback(async () => {
    await Promise.all([
      publishPreview(roomId, strokesRef.current),
      publishCard(roomId, {
        strokes: strokesRef.current,
        activity: activityRef.current,
        online: onlineRef.current,
      }),
    ]);
  }, [roomId]);

  // One socket for as long as this connection is open.
  useEffect(() => {
    const offs = [
      socket.onStatus(setStatus),

      socket.on('joined', (env) => setOnline(env.online ?? 0)),

      socket.on('state', (env) => {
        setStrokes(env.strokes ?? []);
        setOnline(env.online ?? 0);
        activityRef.current = env.activity ?? null;
      }),

      socket.on('draw', (env) => {
        if (!env.stroke) return;
        setStrokes((prev) => upsert(prev, env.stroke!));
        // Something new on the board while you're reading the chat.
        if (env.stroke.userId !== account.userId && activeTabRef.current !== 'board') {
          setBoardNudge(true);
        }
      }),

      socket.on('undo', (env) => {
        if (!env.strokeId) return;
        setStrokes((prev) => prev.filter((s) => s.id !== env.strokeId));
      }),

      socket.on('clear', () => setStrokes([])),

      socket.on('presence', (env) => setOnline(env.online ?? 0)),

      socket.on('chat', (env) => {
        const incoming = env.chat;
        if (!incoming) return;
        setMessages((prev) => mergeMessage(prev, incoming));
        if (incoming.userId === account.userId) return; // our own echo
        if (activeTabRef.current !== 'chat') setUnread((n) => n + 1);
        playHeartChime();
        buzz(12);
      }),

      socket.on('typing', (env) => {
        if (env.userId === account.userId) return;
        setPeerTyping(Boolean(env.typing));
      }),

      socket.on('read', (env) => {
        if (env.userId === account.userId) return;
        setPeerReadAt((prev) => Math.max(prev, env.readAt ?? 0));
      }),

      socket.on('chat_history', (env) => {
        setLoadingHistory(false);
        setHasMoreHistory(Boolean(env.hasMore));
        const page = env.messages ?? [];
        if (env.kind === 'emotion') {
          setLoadingEmotions(false);
          setEmotions((prev) => page.reduce(mergeMessage, prev));
          return;
        }
        setMessages((prev) => page.reduce(mergeMessage, prev));
      }),

      // They sent an action and are waiting for the same one back.
      socket.on('nudge', (env) => {
        if (!env.sticker || env.userId === account.userId) return;
        setNudge({ phase: 'asking', sticker: env.sticker, label: env.label ?? '', at: Date.now() });
        // Keep it in the Emotions tab too, so a missed one is still there.
        setEmotions((prev) =>
          mergeMessage(prev, {
            id: `emo_live_${env.timestamp ?? Date.now()}`,
            roomId,
            userId: env.userId ?? '',
            kind: 'emotion',
            sticker: env.sticker,
            text: env.label,
            createdAt: env.timestamp ?? Date.now(),
          }),
        );
        if (activeTabRef.current !== 'emotions') setEmotionNudge((n) => n + 1);
        playHeartChime();
        buzz([16, 60, 16]);
      }),

      // Both of you sent it: it happens, on both screens at once.
      socket.on('nudge_match', (env) => {
        if (!env.sticker) return;
        setNudge({ phase: 'match', sticker: env.sticker, label: env.label ?? '', at: Date.now() });
        playHeartChime();
        buzz([20, 40, 20, 40, 40]);
        activityRef.current = {
          kind: 'nudge_match',
          userId: env.userId ?? '',
          text: `${env.label ?? '💞'} 💞`,
          timestamp: env.timestamp ?? Date.now(),
        };
        void publishWidgetState();
      }),

      socket.on('error', (env) => {
        // This device is no longer a member — the other person removed the
        // connection, or it was deleted elsewhere.
        if (env.code === 'room_not_found' || env.code === 'unauthorized') setLost(true);
      }),
    ];

    socket.connect({ roomId, userId: account.userId });
    return () => {
      for (const off of offs) off();
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, account.userId]);

  /**
   * Loads the conversation whenever the chat comes to the front.
   *
   * Over HTTP, not the socket: on the first render the socket is still
   * opening, so a `chat_history` frame would be dropped and the chat would sit
   * empty forever. HTTP has no such race, and the socket takes over for live
   * messages once it connects.
   */
  useEffect(() => {
    if (activeTab !== 'chat') return;
    let cancelled = false;

    setUnread(0);
    setLoadingHistory(true);
    fetchHistory(roomId, account.userId)
      .then((page) => {
        if (cancelled) return;
        setHasMoreHistory(page.hasMore);
        setMessages((prev) => page.messages.reduce(mergeMessage, prev));
      })
      .catch(() => {
        // Fall back to the socket: it may be up even when the fetch failed.
        socket.send({ type: 'chat_history', limit: 40 });
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, socket, roomId, account.userId]);

  // The Emotions tab has its own history, from the same store.
  useEffect(() => {
    if (activeTab !== 'emotions') return;
    let cancelled = false;

    setEmotionNudge(0);
    // Snapshot the mark before moving it, so what you missed stays on screen
    // while you are looking at it rather than vanishing as the tab opens.
    setMissedSince(lastEmotionsSeenAt(roomId));
    markEmotionsSeen(roomId);
    setLoadingEmotions(true);
    fetchHistory(roomId, account.userId, 0, 60, 'emotion')
      .then((page) => {
        if (cancelled) return;
        setEmotions((prev) => page.messages.reduce(mergeMessage, prev));
      })
      .catch(() => socket.send({ type: 'chat_history', kind: 'emotion', limit: 60 }))
      .finally(() => {
        if (!cancelled) setLoadingEmotions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, socket, roomId, account.userId]);

  /**
   * Tells the partner this conversation has been read, and keeps it true:
   * anything arriving while the chat is open is read the moment it lands.
   */
  useEffect(() => {
    if (activeTab !== 'chat') return;
    const newest = messages[messages.length - 1];
    if (!newest) return;
    socket.send({ type: 'read', readAt: newest.createdAt });
  }, [activeTab, messages, socket]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') socket.requestSync();
    };
    const onOnline = () => socket.reconnectNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    };
  }, []);

  // The service worker cannot read localStorage, so hand it the room id it
  // needs to fill in a PWA widget.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: 'anivi:pairing', roomId, apiBase: API_URL }))
      .catch(() => {
        /* no worker in dev */
      });
  }, [roomId]);

  useEffect(() => {
    if (pushState() === 'granted') void syncPushSubscription(account.userId);
  }, [account.userId]);

  const schedulePreview = useCallback(() => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      void publishWidgetState();
    }, PREVIEW_DEBOUNCE_MS);
  }, [publishWidgetState]);

  const handleStroke = useCallback(
    (stroke: Stroke, done: boolean) => {
      setStrokes((prev) => upsert(prev, stroke));
      socket.send({ type: 'draw', roomId, userId: account.userId, stroke });
      if (done) schedulePreview();
    },
    [socket, roomId, account.userId, schedulePreview],
  );

  /**
   * Offers notifications after the first thing this device sends.
   *
   * Asking on launch gets refused; asking once someone has actually written to
   * their person is the moment it makes sense.
   */
  function maybeOfferPush() {
    const state = pushState();
    if (state === 'granted') {
      void syncPushSubscription(account.userId);
      return;
    }
    if (state !== 'default') return;
    setOfferPush(true);
  }

  async function acceptPush() {
    setOfferPush(false);
    await enablePush(account.userId);
  }

  async function loadOlderMessages() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingHistory(true);
    try {
      const page = await fetchHistory(roomId, account.userId, oldest.createdAt);
      setHasMoreHistory(page.hasMore);
      setMessages((prev) => page.messages.reduce(mergeMessage, prev));
    } catch {
      socket.send({ type: 'chat_history', before: oldest.createdAt, limit: 40 });
    } finally {
      setLoadingHistory(false);
    }
  }

  function sendChat(chat: Partial<ChatMessage> & { kind: ChatMessage['kind'] }) {
    const optimistic: ChatMessage = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      userId: account.userId,
      kind: chat.kind,
      text: chat.text,
      sticker: chat.sticker,
      attachment: chat.attachment,
      createdAt: Date.now(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    const sent = socket.send({
      type: 'chat',
      roomId,
      chat: { ...optimistic, pending: undefined } as ChatMessage,
    });
    if (!sent) setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    else {
      stopTyping();
      maybeOfferPush();
    }
    return sent;
  }

  /**
   * Sends an action as an invitation rather than a message. Nothing is written
   * to the conversation: if the other person sends the same one back, the
   * server tells both sides at once and it happens together.
   */
  function sendNudge(stickerId: string) {
    unlockSound();
    const sticker = stickerFor(stickerId);
    const label = `${sticker.art} ${sticker.label}`;

    if (!socket.send({ type: 'nudge', roomId, userId: account.userId, sticker: stickerId, label })) {
      return;
    }
    playSentBlip();
    buzz(14);
    // Nothing is added locally: the sender is not shown their own emotions
    // (you cannot miss something you sent), and inserting a copy here used to
    // duplicate the stored one when history loaded.
    maybeOfferPush();
    setNudge((prev) =>
      prev.phase === 'asking' && prev.sticker === stickerId
        ? prev
        : { phase: 'waiting', sticker: stickerId, label, at: Date.now() },
    );
  }

  /**
   * Signals typing, and stops signalling shortly after the keys stop.
   *
   * Nothing is stored and nothing is retried: if a "stopped" frame is lost the
   * indicator clears itself on the other side anyway.
   */
  function handleTyping() {
    if (!typingSentRef.current) {
      typingSentRef.current = true;
      socket.send({ type: 'typing', typing: true });
    }
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      typingSentRef.current = false;
      socket.send({ type: 'typing', typing: false });
    }, 2500);
  }

  function stopTyping() {
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    if (!typingSentRef.current) return;
    typingSentRef.current = false;
    socket.send({ type: 'typing', typing: false });
  }

  function handleUndo() {
    socket.send({ type: 'undo' });
    schedulePreview();
  }

  function handleClear() {
    socket.send({ type: 'clear' });
    schedulePreview();
  }

  const statusPill = useMemo(() => {
    if (status !== 'online') {
      return { text: status === 'connecting' ? 'Connecting…' : 'Offline', className: 'pill dim' };
    }
    return online > 1
      ? { text: 'Together', className: 'pill live' }
      : { text: 'Online', className: 'pill' };
  }, [status, online]);

  return (
    <div className="screen space">
      <header className="topbar">
        <button className="back-btn" onClick={onBack} aria-label="Back to connections">
          ‹
        </button>
        <div className="space-who">
          <span className="space-name">{peerName}</span>
          <span className="space-rel">{RELATIONSHIP_BADGE[relationship] ?? relationship}</span>
        </div>
        <span className={statusPill.className}>{statusPill.text}</span>
        <button
          className="icon-btn settings-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
        >
          ⚙️
        </button>
      </header>

      {lost && (
        <div className="lost-banner" role="alert">
          <span>This space isn&rsquo;t available any more.</span>
          <button className="btn-inline" onClick={onDisconnected}>
            Back to connections
          </button>
        </div>
      )}

      {activeTab === 'board' && (
        <>
          <div className="canvas-wrap">
            <Canvas
              strokes={strokes}
              tool={tool}
              color={color}
              width={width}
              userId={account.userId}
              onStroke={handleStroke}
            />
            {strokes.length === 0 && (
              <p className="canvas-empty" aria-hidden="true">
                Draw together ❤️
              </p>
            )}
          </div>

          <footer className="toolbar">
            <div className="tool-row">
              <button
                className={`tool ${tool === 'pen' ? 'active' : ''}`}
                onClick={() => setTool('pen')}
                aria-pressed={tool === 'pen'}
                title="Pen"
              >
                ✏️
              </button>
              <button
                className={`tool ${tool === 'eraser' ? 'active' : ''}`}
                onClick={() => setTool('eraser')}
                aria-pressed={tool === 'eraser'}
                title="Eraser"
              >
                🧹
              </button>
              <button className="tool" onClick={handleUndo} title="Undo">
                ↩️
              </button>
              <button className="tool" onClick={handleClear} title="Clear the board">
                🗑️
              </button>

              <div className="spacer" />

              <div className="sizes" role="group" aria-label="Brush size">
                {PEN_WIDTHS.map((w) => (
                  <button
                    key={w.label}
                    className={`size ${width === w.value ? 'active' : ''}`}
                    onClick={() => setWidth(w.value)}
                    aria-pressed={width === w.value}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="colors" role="group" aria-label="Pen colour">
              {PEN_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${color === c && tool === 'pen' ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => {
                    setColor(c);
                    setTool('pen');
                  }}
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>

          </footer>
        </>
      )}

      {activeTab === 'emotions' && (
        <EmotionsView
          emotions={emotions}
          myUserId={account.userId}
          peerName={peerName}
          relationship={relationship}
          loading={loadingEmotions}
          missedSince={missedSince}
          onSend={sendNudge}
        />
      )}

      {activeTab === 'chat' && (
        <ChatSheet
          messages={messages}
          myUserId={account.userId}
          roomId={roomId}
          hasMore={hasMoreHistory}
          loadingHistory={loadingHistory}
          onSendText={(text) => sendChat({ kind: 'text', text })}
          onSendImage={(key, mime, size, caption) =>
            sendChat({
              kind: 'image',
              text: caption || undefined,
              attachment: { key, url: '', mime, size },
            })
          }
          onLoadOlder={() => void loadOlderMessages()}
          peerTyping={peerTyping}
          peerReadAt={peerReadAt}
          peerName={peerName}
          onTyping={handleTyping}
        />
      )}

      <nav className="bottom-nav" aria-label="Sections">
        <button
          className={`nav-btn ${activeTab === 'emotions' ? 'active' : ''}`}
          onClick={() => setActiveTab('emotions')}
          aria-current={activeTab === 'emotions'}
        >
          <span aria-hidden="true">💞</span>
          Emotions
          {emotionNudge > 0 && (
            <span className="unread-tab">{emotionNudge > 9 ? '9+' : emotionNudge}</span>
          )}
        </button>
        <button
          className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          aria-current={activeTab === 'chat'}
        >
          <span aria-hidden="true">💬</span>
          Chat
          {unread > 0 && <span className="unread-tab">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button
          className={`nav-btn ${activeTab === 'board' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('board');
            setBoardNudge(false);
          }}
          aria-current={activeTab === 'board'}
        >
          <span aria-hidden="true">🎨</span>
          Board
          {boardNudge && (
            <span className="board-dot" aria-label="New drawing">
              ✏️
            </span>
          )}
        </button>
      </nav>

      {offerPush && (
        <div className="push-offer" role="dialog" aria-label="Notifications">
          <span className="push-offer-art" aria-hidden="true">
            🔔
          </span>
          <div className="push-offer-body">
            <p className="push-offer-title">Get notified?</p>
            <p className="push-offer-sub">
              So you know when {peerName} writes, even with Anivi closed.
            </p>
          </div>
          <button className="nudge-answer" onClick={acceptPush}>
            Turn on
          </button>
          <button className="nudge-close" onClick={() => setOfferPush(false)} aria-label="Not now">
            ✕
          </button>
        </div>
      )}

      <NudgeOverlay
        state={nudge}
        onAnswer={sendNudge}
        onDismiss={() => setNudge({ phase: 'idle' })}
      />

      {settingsOpen && (
        <SettingsSheet
          account={account}
          connection={connection}
          online={online}
          onClose={() => setSettingsOpen(false)}
          onDisconnected={onDisconnected}
        />
      )}
    </div>
  );
}

/**
 * Adds a message to the conversation, keeping it ordered and free of
 * duplicates. The server echoes every message back with its authoritative id,
 * so an optimistic local bubble has to be recognised and replaced.
 */
function mergeMessage(prev: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const byId = prev.findIndex((m) => m.id === msg.id);
  if (byId !== -1) {
    const next = prev.slice();
    next[byId] = msg;
    return next;
  }

  const pendingTwin = prev.findIndex(
    (m) =>
      m.pending &&
      m.userId === msg.userId &&
      m.kind === msg.kind &&
      (m.text ?? '') === (msg.text ?? '') &&
      (m.sticker ?? '') === (msg.sticker ?? '') &&
      (m.attachment?.key ?? '') === (msg.attachment?.key ?? '') &&
      Math.abs(m.createdAt - msg.createdAt) < 30_000,
  );
  if (pendingTwin !== -1) {
    const next = prev.slice();
    next[pendingTwin] = msg;
    return next;
  }

  const next = [...prev, msg];
  next.sort((a, b) => a.createdAt - b.createdAt);
  return next;
}

/** Replaces a stroke with the same id, or appends it. */
function upsert(strokes: Stroke[], stroke: Stroke): Stroke[] {
  const i = strokes.findIndex((s) => s.id === stroke.id);
  if (i === -1) return [...strokes, stroke];
  const next = strokes.slice();
  next[i] = stroke;
  return next;
}
