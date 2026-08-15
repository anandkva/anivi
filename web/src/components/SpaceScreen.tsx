import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from './Canvas';
import { MissYouOverlay, type MissYouKind } from './MissYouOverlay';
import { SettingsSheet } from './SettingsSheet';
import { sendMissYouHttp } from '../lib/api';
import { API_URL } from '../lib/config';
import { publishPreview } from '../lib/preview';
import { publishCard } from '../lib/widgetCard';
import { PEN_COLORS, type Activity, type Stroke, type Tool } from '../lib/protocol';
import { AniviSocket, type ConnectionStatus } from '../lib/socket';
import { buzz, playHeartChime, playSentBlip, unlockSound } from '../lib/sound';
import { savePairing, type Pairing } from '../lib/storage';

/** The canvas snapshot is republished at most this often. */
const PREVIEW_DEBOUNCE_MS = 2500;

const PEN_WIDTHS = [
  { label: 'S', value: 0.004 },
  { label: 'M', value: 0.008 },
  { label: 'L', value: 0.016 },
];

interface Props {
  pairing: Pairing;
  onPairingChange: (pairing: Pairing) => void;
  onLeave: () => void;
}

/** The shared space: live canvas, presence, and Miss You. */
export function SpaceScreen({ pairing, onPairingChange, onLeave }: Props) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [online, setOnline] = useState(0);
  const [missToken, setMissToken] = useState(0);
  const [missKind, setMissKind] = useState<MissYouKind>('received');
  const [sentHeart, setSentHeart] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lost, setLost] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PEN_COLORS[0]);
  const [width, setWidth] = useState(PEN_WIDTHS[1].value);

  const socketRef = useRef<AniviSocket | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  // Held in refs as well so the debounced widget upload always sees the newest
  // canvas without re-arming the timer on every stroke.
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;
  const activityRef = useRef<Activity | null>(null);
  const onlineRef = useRef(0);
  onlineRef.current = online;

  if (socketRef.current === null) socketRef.current = new AniviSocket();
  const socket = socketRef.current;

  // One socket for the lifetime of the paired session.
  useEffect(() => {
    const offs = [
      socket.onStatus(setStatus),

      socket.on('joined', (env) => {
        setOnline(env.online ?? 0);
        // The server is the authority on the Love Code and on whether the
        // partner has ever joined.
        const next: Pairing = {
          roomId: env.roomId ?? pairing.roomId,
          loveCode: env.loveCode ?? pairing.loveCode,
          userId: env.userId ?? pairing.userId,
          paired: env.paired ?? pairing.paired,
        };
        savePairing(next);
        onPairingChange(next);
      }),

      // A full replay: this is what makes a reconnect restore the canvas.
      socket.on('state', (env) => {
        setStrokes(env.strokes ?? []);
        setOnline(env.online ?? 0);
        activityRef.current = env.activity ?? null;
      }),

      socket.on('draw', (env) => {
        if (!env.stroke) return;
        setStrokes((prev) => upsert(prev, env.stroke!));
      }),

      socket.on('undo', (env) => {
        if (!env.strokeId) return;
        setStrokes((prev) => prev.filter((s) => s.id !== env.strokeId));
      }),

      socket.on('clear', () => setStrokes([])),

      socket.on('presence', (env) => {
        setOnline(env.online ?? 0);
        if (env.paired && !pairing.paired) {
          const next = { ...pairing, paired: true };
          savePairing(next);
          onPairingChange(next);
        }
      }),

      socket.on('error', (env) => {
        // The stored pairing points at a space the server cannot open (and
        // could not re-open from the Love Code). Say so instead of retrying
        // forever behind a hopeful "Connecting…".
        if (env.code === 'room_not_found') setLost(true);
      }),

      socket.on('miss_you', (env) => {
        setMissKind('received');
        setMissToken((t) => t + 1);
        activityRef.current = env.activity ?? {
          kind: 'miss_you',
          userId: env.userId ?? '',
          text: 'They miss you ❤️',
          timestamp: env.timestamp ?? Date.now(),
        };
        playHeartChime();
        buzz();
        // Refresh the Home Screen card right away: a heart is exactly what
        // the widget exists to show.
        void publishWidgetState();
      }),
    ];

    socket.connect(pairing);
    return () => {
      for (const off of offs) off();
      socket.disconnect();
    };
    // Reconnect only when the room itself changes, not on every pairing edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairing.roomId]);

  // Coming back from the background: ask for a replay rather than trusting
  // whatever the tab was holding.
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
  // needs to fill in a PWA widget (Windows 11's widget board today).
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.active?.postMessage({
          type: 'anivi:pairing',
          roomId: pairing.roomId,
          apiBase: API_URL,
        }),
      )
      .catch(() => {
        /* no worker in dev, nothing to mirror */
      });
  }, [pairing.roomId]);

  /**
   * Publishes what the Home Screen widgets read: the bare canvas snapshot and
   * the composed card. Widgets never connect to the socket — they show the
   * latest image the open app left for them.
   */
  const publishWidgetState = useCallback(async () => {
    await Promise.all([
      publishPreview(pairing.roomId, strokesRef.current),
      publishCard(pairing.roomId, {
        strokes: strokesRef.current,
        activity: activityRef.current,
        online: onlineRef.current,
      }),
    ]);
  }, [pairing.roomId]);

  /** Regenerates the widget images a moment after the drawing settles. */
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
      socket.send({ type: 'draw', roomId: pairing.roomId, userId: pairing.userId, stroke });
      if (done) schedulePreview();
    },
    [socket, pairing.roomId, pairing.userId, schedulePreview],
  );

  function handleUndo() {
    // The server decides which stroke disappears and tells both sides.
    socket.send({ type: 'undo' });
    schedulePreview();
  }

  function handleClear() {
    socket.send({ type: 'clear' });
    schedulePreview();
  }

  async function handleMissYou() {
    unlockSound();
    // Sending should feel like something happened on this side too — a haptic
    // tap, its own sound, and hearts rising off the button.
    buzz([14, 30, 14]);
    playSentBlip();
    setMissKind('sent');
    setMissToken((t) => t + 1);
    setSentHeart(true);
    window.setTimeout(() => setSentHeart(false), 1600);

    if (!socket.send({ type: 'miss_you', roomId: pairing.roomId, userId: pairing.userId })) {
      // Socket down: the heart still goes out over HTTP.
      await sendMissYouHttp(pairing.roomId, pairing.userId);
    }

    // Update the card from this side too, so the heart reaches the partner's
    // Home Screen even if their app never opens.
    activityRef.current = {
      kind: 'miss_you',
      userId: pairing.userId,
      text: 'They miss you ❤️',
      timestamp: Date.now(),
    };
    await publishWidgetState();
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
        <span className="brand">❤️ Anivi</span>
        <span className={statusPill.className}>{statusPill.text}</span>
        <button
          className="icon-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          ⚙️
        </button>
      </header>

      {lost && (
        <div className="lost-banner" role="alert">
          <span>This space isn&rsquo;t available any more.</span>
          <button className="btn-inline" onClick={onLeave}>
            Start a new one ❤️
          </button>
        </div>
      )}

      <div className="canvas-wrap">
        <Canvas
          strokes={strokes}
          tool={tool}
          color={color}
          width={width}
          userId={pairing.userId}
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
          <button className="tool" onClick={handleClear} title="Clear the canvas">
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

        <button
          className={`btn btn-miss ${sentHeart ? 'sending' : ''}`}
          onClick={handleMissYou}
        >
          {sentHeart ? 'Sent ❤️' : 'Miss You ❤️'}
        </button>
      </footer>

      <MissYouOverlay token={missToken} kind={missKind} onDone={() => setMissToken(0)} />

      {settingsOpen && (
        <SettingsSheet
          pairing={pairing}
          online={online}
          onClose={() => setSettingsOpen(false)}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}

/** Replaces a stroke with the same id, or appends it. */
function upsert(strokes: Stroke[], stroke: Stroke): Stroke[] {
  const i = strokes.findIndex((s) => s.id === stroke.id);
  if (i === -1) return [...strokes, stroke];
  const next = strokes.slice();
  next[i] = stroke;
  return next;
}
