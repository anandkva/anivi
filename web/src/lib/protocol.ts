/**
 * The Anivi wire format, mirrored from server/protocol/protocol.go.
 * Keep the two in sync — they are the contract every client shares.
 */

export type Tool = 'pen' | 'eraser';

export interface Point {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

export interface Stroke {
  id: string;
  userId: string;
  tool: Tool;
  color: string;
  width: number; // normalized to canvas width
  points: Point[];
}

export interface Activity {
  kind: string;
  userId: string;
  text: string;
  timestamp: number;
}

export interface Attachment {
  key: string;
  /** Freshly signed on every read, so an old photo still opens. */
  url: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
}

export type ChatKind = 'text' | 'sticker' | 'image';

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  kind: ChatKind;
  text?: string;
  /** Names a piece of clipart the clients know how to draw. */
  sticker?: string;
  attachment?: Attachment;
  createdAt: number;
  /** Local only: set while an outgoing message is still in flight. */
  pending?: boolean;
}

export type ClientMessageType =
  | 'join'
  | 'draw'
  | 'undo'
  | 'clear'
  | 'sync'
  | 'miss_you'
  | 'chat'
  | 'chat_history'
  | 'nudge'
  | 'ping'
  | 'pong';

export type ServerMessageType =
  | ClientMessageType
  | 'joined'
  | 'state'
  | 'presence'
  | 'nudge_match'
  | 'error';

export interface Envelope {
  type: ServerMessageType;
  roomId?: string;
  userId?: string;
  loveCode?: string;
  stroke?: Stroke;
  strokeId?: string;
  strokes?: Stroke[];
  activity?: Activity;
  /** Nudges: the sticker's id, and the client's own wording for it. */
  sticker?: string;
  label?: string;
  chat?: ChatMessage;
  messages?: ChatMessage[];
  before?: number;
  limit?: number;
  hasMore?: boolean;
  online?: number;
  paired?: boolean;
  timestamp?: number;
  message?: string;
  code?: string;
}

export const PEN_COLORS = [
  '#ff5c8a',
  '#ff9f68',
  '#ffd166',
  '#6ee7b7',
  '#7cc4ff',
  '#c4a3ff',
  '#2b2440',
] as const;

/** Normalizes whatever the partner typed into LOVE-XXXXX, or '' if unusable. */
export function normalizeLoveCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^LOVE/, '');
  return cleaned.length === 5 ? `LOVE-${cleaned}` : '';
}
