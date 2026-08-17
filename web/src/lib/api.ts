import { apiUrl } from './config';


import type { ChatMessage } from './protocol';

/**
 * Loads chat history over HTTP.
 *
 * The socket also serves history, but only once it is open — and the chat is
 * on screen before that. Fetching over HTTP means a conversation is there the
 * moment you walk into a space, with the socket taking over for live messages.
 */
export async function fetchHistory(
  roomId: string,
  userId: string,
  before = 0,
  limit = 40,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before > 0) params.set('before', String(before));

  const res = await fetch(
    apiUrl(`/api/room/${encodeURIComponent(roomId)}/messages?${params.toString()}`),
    { headers: { Authorization: `Bearer ${userId}` } },
  );
  if (!res.ok) throw new Error("Couldn't load your messages");
  return (await res.json()) as { messages: ChatMessage[]; hasMore: boolean };
}

/** What the server returns after storing an image. */
export interface UploadedAttachment {
  key: string;
  url: string;
  mime: string;
  size: number;
}

/**
 * Uploads one image for a room.
 *
 * The upload happens first and the chat message referring to its key is sent
 * afterwards, so a failed or abandoned upload never leaves a broken bubble in
 * the conversation.
 */
export async function uploadAttachment(
  roomId: string,
  userId: string,
  file: File,
): Promise<UploadedAttachment> {
  const body = new FormData();
  body.append('file', file, file.name);

  const res = await fetch(apiUrl(`/api/room/${encodeURIComponent(roomId)}/attachments`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${userId}` },
    body,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? "Couldn't send that photo");
  }
  return (await res.json()) as UploadedAttachment;
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
