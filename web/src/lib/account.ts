import { apiUrl } from './config';

/**
 * Accounts and connections.
 *
 * There is no password anywhere in Anivi: a name gets you an Anivi Code, and
 * that code is your identity. Anyone holding it can ask to connect, and the
 * relationship they pick is what the space becomes.
 */

export type Relationship = 'partner' | 'friend' | 'family';

export interface Account {
  userId: string;
  aniviCode: string;
  name: string;
  createdAt: number;
}

export interface Connection {
  connectionId: string;
  roomId: string;
  relationship: Relationship;
  peerName: string;
  peerCode: string;
  createdAt: number;
  /** When the newest message in this room was sent, and by whom. */
  lastActivityAt: number;
  lastActivityBy?: string;
  unreadCount?: number;
}

export interface Me {
  account: Account;
  connections: Connection[];
}

/**
 * The user id doubles as the bearer token. That is the whole auth story, and
 * it is deliberate: the code is the identity, so anything stronger would mean
 * inventing passwords Anivi does not want.
 */
function authHeaders(userId: string): HeadersInit {
  return { Authorization: `Bearer ${userId}` };
}

async function readError(res: Response, fallback: string): Promise<never> {
  const detail = (await res.json().catch(() => null)) as { message?: string } | null;
  throw new Error(detail?.message ?? fallback);
}

/**
 * What account creation returns: the account, plus the sign-in PIN shown
 * exactly once. Nothing can recover it later — only its hash is stored.
 */
export interface NewAccount extends Account {
  signInPin: string;
}

/** Creates an account from a name alone and returns its Anivi Code and PIN. */
export async function createAccount(name: string): Promise<NewAccount> {
  const res = await fetch(apiUrl('/api/account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) await readError(res, "Couldn't create your account");
  return (await res.json()) as NewAccount;
}

/**
 * Signs in on another device.
 *
 * Both halves are needed: the Anivi Code identifies you, the PIN proves it is
 * you. The code alone can't — you hand it out to everyone you connect with.
 */
export async function signIn(code: string, pin: string): Promise<Account> {
  const res = await fetch(apiUrl('/api/signin'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, pin: pin.trim().toUpperCase() }),
  });
  if (res.status === 401) throw new Error("That code and PIN don't match");
  if (res.status === 409) {
    throw new Error(
      'This account was made before sign-in existed. Open Anivi on the device that has it, and create a PIN in Settings.',
    );
  }
  if (!res.ok) await readError(res, "Couldn't sign in");
  return (await res.json()) as Account;
}

/** Issues a fresh sign-in PIN, from a device that is already signed in. */
export async function resetPin(userId: string): Promise<string> {
  const res = await fetch(apiUrl('/api/account/pin'), {
    method: 'POST',
    headers: authHeaders(userId),
  });
  if (!res.ok) await readError(res, "Couldn't create a PIN");
  const data = (await res.json()) as { signInPin: string };
  return data.signInPin;
}

/** Loads the account and everyone it is connected to. */
export async function fetchMe(userId: string): Promise<Me> {
  const res = await fetch(apiUrl('/api/me'), { headers: authHeaders(userId) });
  if (!res.ok) await readError(res, "Couldn't load your connections");
  return (await res.json()) as Me;
}

export async function renameAccount(userId: string, name: string): Promise<Account> {
  const res = await fetch(apiUrl('/api/account'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(userId) },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) await readError(res, "Couldn't change your name");
  return (await res.json()) as Account;
}

export interface ConnectResult {
  connection: Connection;
  /** True when the two were already connected: connecting again is harmless. */
  alreadyConnected: boolean;
}

/** Connects to whoever owns `code`, with the relationship the user picked. */
export async function connect(
  userId: string,
  code: string,
  relationship: Relationship,
): Promise<ConnectResult> {
  const res = await fetch(apiUrl('/api/connections'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(userId) },
    body: JSON.stringify({ code, relationship }),
  });
  if (res.status === 404) throw new Error("We couldn't find that Anivi Code");
  if (!res.ok) await readError(res, "Couldn't connect");
  return (await res.json()) as ConnectResult;
}

export async function disconnect(userId: string, connectionId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/connections/${encodeURIComponent(connectionId)}`), {
    method: 'DELETE',
    headers: authHeaders(userId),
  });
  if (!res.ok && res.status !== 404) await readError(res, "Couldn't remove that connection");
}

/** Normalizes whatever was typed into ANV-XXXXX, or '' if unusable. */
export function normalizeAniviCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ANV/, '');
  return cleaned.length === 5 ? `ANV-${cleaned}` : '';
}
