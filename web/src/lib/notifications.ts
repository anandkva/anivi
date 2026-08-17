import { apiUrl } from './config';

/**
 * Push notifications, so a message reaches a phone whose app is closed.
 *
 * This is Web Push, which works for an **installed** PWA: on Android after
 * "Install app", on iPhone only after "Add to Home Screen" (iOS 16.4+). A tab
 * in Safari cannot receive them, which is why the app asks people to install
 * before offering this.
 */

const STORAGE_KEY = 'anivi.push.v1';

export type PushState = 'unsupported' | 'not-installed' | 'default' | 'granted' | 'denied';

/** Whether this browser can receive push at all. */
export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * iOS only delivers push to a Home Screen app. Detecting that up front lets
 * the app say "add me to your Home Screen first" instead of asking for a
 * permission the browser will never honour.
 */
export function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag for a Home Screen app.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);

export function pushState(): PushState {
  if (!pushSupported()) return 'unsupported';
  if (isIOS && !isInstalled()) return 'not-installed';
  return Notification.permission as PushState;
}

/** Remembers that this device already subscribed, to avoid asking again. */
export function alreadySubscribed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function remember(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, 'on');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

interface PushKey {
  enabled: boolean;
  publicKey: string;
}

/**
 * Asks for permission and registers this device.
 *
 * Returns false when push is unavailable or declined — the caller should treat
 * that as "carry on without notifications", never as an error worth blocking
 * on.
 */
export async function enablePush(userId: string): Promise<boolean> {
  if (!pushSupported()) return false;

  try {
    const keyRes = await fetch(apiUrl('/api/push/key'));
    const key = (await keyRes.json()) as PushKey;
    if (!key.enabled || !key.publicKey) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      remember(false);
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    // Reuse an existing subscription rather than churning endpoints, but
    // re-send it: the server may have forgotten it.
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey),
      }));

    const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
    const res = await fetch(apiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userId}` },
      body: JSON.stringify({
        endpoint: json.endpoint ?? '',
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      }),
    });
    if (!res.ok) return false;

    remember(true);
    return true;
  } catch {
    return false;
  }
}

/** Turns notifications off for this device. */
export async function disablePush(userId: string): Promise<void> {
  remember(false);
  if (!pushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await fetch(apiUrl('/api/push/unsubscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userId}` },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  } catch {
    /* nothing more to do */
  }
}

/**
 * The VAPID key arrives as URL-safe base64; PushManager wants raw bytes.
 */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  // An ArrayBuffer rather than a view: PushManager's type wants a buffer whose
  // backing store is definitely not shared.
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buffer;
}
