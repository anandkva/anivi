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
const SERVICE_WORKER_READY_TIMEOUT_MS = 8000;

export type PushState = 'unsupported' | 'not-installed' | 'default' | 'granted' | 'denied';

/** Whether this browser can receive push at all. */
export function pushSupported(): boolean {
  return (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
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
  if (!pushSupported()) {
    logPush('unsupported browser or insecure context');
    remember(false);
    return false;
  }
  if (isIOS && !isInstalled()) {
    logPush('iOS push requires the installed Home Screen app');
    remember(false);
    return false;
  }

  try {
    // Keep this as the first awaited browser API in the tap handler. iOS
    // requires notification permission to be requested from direct user
    // interaction; doing network work first can lose that activation.
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (permission !== 'granted') {
      logPush(`permission ${permission}`);
      remember(false);
      return false;
    }

    return await syncPushSubscription(userId);
  } catch (err) {
    logPush('permission/subscription failed', err);
    remember(false);
    return false;
  }
}

/**
 * Re-sends the current browser subscription to the server.
 *
 * This is intentionally separate from permission prompting. iOS subscriptions
 * belong to the installed web app context and may be missing even when local
 * storage says "on"; the server may also have lost its copy after a database
 * restore. When permission is already granted, calling this keeps both sides
 * honest without showing another prompt.
 */
export async function syncPushSubscription(userId: string): Promise<boolean> {
  if (!pushSupported() || (isIOS && !isInstalled()) || Notification.permission !== 'granted') {
    return false;
  }

  try {
    const keyRes = await fetch(apiUrl('/api/push/key'));
    if (!keyRes.ok) {
      logPush(`VAPID key request failed: ${keyRes.status}`);
      remember(false);
      return false;
    }
    const key = (await keyRes.json()) as PushKey;
    if (!key.enabled || !key.publicKey) {
      logPush('push disabled on server or VAPID public key missing');
      remember(false);
      return false;
    }

    const registration = await pushRegistration();
    if (!registration?.pushManager) {
      logPush('service worker registration or PushManager missing');
      remember(false);
      return false;
    }

    // Reuse an existing subscription rather than churning endpoints, but
    // re-send it: the server may have forgotten it.
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey),
      }));

    const json = subscriptionJSON(subscription);
    if (!json.endpoint || !json.p256dh || !json.auth) {
      logPush('browser returned an incomplete PushSubscription', json);
      remember(false);
      return false;
    }

    const res = await fetch(apiUrl('/api/push/subscribe'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userId}` },
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.p256dh,
        auth: json.auth,
      }),
    });
    if (!res.ok) {
      logPush(`server rejected subscription: ${res.status} ${await res.text()}`);
      remember(false);
      return false;
    }

    remember(true);
    logPush(`subscription saved (${endpointHost(json.endpoint)})`);
    return true;
  } catch (err) {
    logPush('sync subscription failed', err);
    remember(false);
    return false;
  }
}

/** Turns notifications off for this device. */
export async function disablePush(userId: string): Promise<void> {
  remember(false);
  if (!pushSupported()) return;
  try {
    const registration = await pushRegistration();
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

async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  const registered = await navigator.serviceWorker.getRegistration('/');
  if (registered && scopeCoversApp(registered)) return registered;

  const ready = await withTimeout(
    navigator.serviceWorker.ready,
    SERVICE_WORKER_READY_TIMEOUT_MS,
    'service worker was not ready in time',
  );
  if (!scopeCoversApp(ready)) {
    throw new Error(`service worker scope ${ready.scope} does not cover ${location.href}`);
  }
  return ready;
}

function scopeCoversApp(registration: ServiceWorkerRegistration): boolean {
  const scope = new URL(registration.scope);
  return location.href.startsWith(scope.href);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function subscriptionJSON(subscription: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} {
  const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    p256dh: json.keys?.p256dh ?? keyToBase64Url(subscription.getKey('p256dh')),
    auth: json.keys?.auth ?? keyToBase64Url(subscription.getKey('auth')),
  };
}

function keyToBase64Url(key: ArrayBuffer | null): string {
  if (!key) return '';
  const bytes = new Uint8Array(key);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return 'unknown endpoint';
  }
}

function logPush(message: string, detail?: unknown): void {
  const prefix = '[anivi:push]';
  if (detail !== undefined) console.info(prefix, message, detail);
  else console.info(prefix, message);
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
