import { apiUrl } from '../lib/config';
import { loadPairing } from '../lib/storage';

/**
 * The Anivi widget surface.
 *
 * This page is what a Home Screen widget host renders: it never opens a
 * WebSocket. It polls the room's snapshot, shows the latest drawing and
 * activity, and hands off to the full app on tap — a live-feeling snapshot,
 * not a live connection.
 *
 * Usage: /widget?room=room_xxx (the room id can also come from the pairing
 * stored by the app when both run on the same origin).
 */

const POLL_MS = 30_000;

interface RoomState {
  roomId: string;
  paired: boolean;
  online: number;
  lastActivity: string;
  lastActivityKind: string;
  lastActivityTimestamp: number;
  hasPreview: boolean;
  previewUpdatedAt: number;
}

const params = new URLSearchParams(location.search);
const roomId = params.get('room') ?? loadPairing()?.roomId ?? '';
const userId = params.get('user') ?? loadPairing()?.userId ?? '';
// Widget hosts often have no gesture affordances beyond a tap, so the Miss You
// button is opt-in via ?actions=1.
const showActions = params.get('actions') === '1';

const el = {
  preview: byId('preview'),
  activity: byId('activity'),
  when: byId('when'),
  presence: byId('presence'),
  open: byId('open') as HTMLAnchorElement,
  actions: byId('actions'),
  miss: byId('miss') as HTMLButtonElement,
};

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`anivi: #${id} missing`);
  return node;
}

el.open.href = roomId ? `/?room=${encodeURIComponent(roomId)}` : '/';
// Tapping anywhere opens the app, which is how widgets are expected to behave.
document.body.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('#miss')) return;
  window.open(el.open.href, '_blank');
});

if (showActions && roomId) {
  el.actions.hidden = false;
  el.miss.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.miss.disabled = true;
    el.miss.textContent = 'Sent ❤️';
    try {
      await fetch(apiUrl(`/api/room/${encodeURIComponent(roomId)}/miss_you`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    } catch {
      el.miss.textContent = 'Try again';
    }
    window.setTimeout(() => {
      el.miss.disabled = false;
      el.miss.textContent = 'Miss You ❤️';
    }, 2500);
  });
}

async function refresh(): Promise<void> {
  if (!roomId) {
    el.activity.textContent = 'Open Anivi to pair ❤️';
    el.preview.textContent = 'Not paired yet';
    return;
  }
  try {
    const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomId)}`), {
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(String(res.status));
    render(await res.json());
  } catch {
    // Keep whatever is on screen; a widget flashing an error is worse than a
    // slightly stale snapshot.
    el.when.textContent = 'offline';
  }
}

function render(state: RoomState): void {
  el.activity.textContent =
    state.lastActivityKind === 'miss_you' ? '❤️ They miss you' : state.lastActivity;
  el.when.textContent = relativeTime(state.lastActivityTimestamp);
  el.presence.textContent = state.online > 1 ? '🟢 together' : '';

  if (state.hasPreview) {
    const url = apiUrl(
      `/api/room/${encodeURIComponent(state.roomId)}/preview?v=${state.previewUpdatedAt}`,
    );
    el.preview.style.backgroundImage = `url("${url}")`;
    el.preview.textContent = '';
  } else {
    el.preview.style.backgroundImage = '';
    el.preview.textContent = 'Draw together ❤️';
  }
}

function relativeTime(ts: number): string {
  if (!ts) return '';
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

void refresh();
window.setInterval(refresh, POLL_MS);
// Widget hosts commonly suspend the web view; refresh the moment it is shown.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});
