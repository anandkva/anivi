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
  duration?: number;
  fileName?: string;
}

export type ChatKind = 'text' | 'sticker' | 'image' | 'audio' | 'document' | 'emotion';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read';

export interface ChatReply {
  id: string;
  userId: string;
  senderName: string;
  text: string;
  kind?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  senderName?: string;
  kind: ChatKind;
  text?: string;
  /** Names a piece of clipart the clients know how to draw. */
  sticker?: string;
  attachment?: Attachment;
  status?: MessageStatus;
  replyTo?: ChatReply;
  reactions?: Record<string, string[]>; // emoji -> array of userIds
  audioDuration?: number;
  waveform?: number[];
  fileName?: string;
  fileSize?: number;
  editedAt?: number;
  deletedForEveryone?: boolean;
  deletedForMe?: boolean;
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
  | 'chat_read'
  | 'chat_delivery'
  | 'chat_reaction'
  | 'chat_edit'
  | 'chat_delete'
  | 'nudge'
  | 'typing'
  | 'read'
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
  /** True while the partner is composing. */
  typing?: boolean;
  /** How far through the conversation the partner has read. */
  readAt?: number;
  /** Narrows a history request: 'emotion' for the Emotions tab. */
  kind?: string;
  chat?: ChatMessage;
  messages?: ChatMessage[];
  before?: number;
  limit?: number;
  hasMore?: boolean;

  // Real-time message status & reaction actions
  messageId?: string;
  reaction?: string;
  status?: MessageStatus;
  readReceiptsDisabled?: boolean;

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
