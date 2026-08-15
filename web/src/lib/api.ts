import { apiUrl } from './config';
import type { Pairing } from './storage';

/** Opens a brand new space and returns the couple's identifiers. */
export async function createSpace(): Promise<Pairing> {
  const res = await fetch(apiUrl('/api/pair/create'), { method: 'POST' });
  if (!res.ok) throw new Error("Couldn't create your space");
  const data = (await res.json()) as Pairing;
  return { ...data, paired: false };
}

/** Joins the partner's space using their Love Code. */
export async function joinSpace(loveCode: string): Promise<Pairing> {
  const res = await fetch(apiUrl('/api/pair/join'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loveCode }),
  });
  if (res.status === 404) throw new Error("We couldn't find that Love Code");
  if (!res.ok) throw new Error("Couldn't join that space");
  const data = (await res.json()) as Pairing;
  return { ...data, paired: true };
}

/** Sends a heart over HTTP (used when the socket is down). */
export async function sendMissYouHttp(roomId: string, userId: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomId)}/miss_you`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
