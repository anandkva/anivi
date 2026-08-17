import type { Relationship } from './account';

/**
 * Anivi's virtual actions.
 *
 * The set changes with the relationship — a hug belongs to a partner, "Good
 * job" to a friend, "Blessings" to family — because the same space means
 * something different depending on who you share it with. That switch is what
 * makes Anivi more than a two-person chat.
 *
 * Only an action's id travels over the wire and into the database; the art
 * lives here. So the set can be restyled or extended without touching stored
 * history, and an id from a newer client still renders as something warm.
 */

export interface Sticker {
  /** Stable id. Never rename one: it is what history and nudges carry. */
  id: string;
  art: string;
  label: string;
  /** The wording the two of them would actually use. */
  hint?: string;
  /** CSS class that animates the art continuously. */
  animation?: string;
}

const PARTNER: Sticker[] = [
 
  { id: 'hug', art: '🤗', label: 'Hug', hint: 'kattikko', animation: 'anim-wiggle' },
  { id: 'miss_you', art: '🥺', label: 'Miss You', hint: 'miss you', animation: 'anim-heartbeat' },
  { id: 'love', art: '❤️', label: 'Love', hint: 'love you da', animation: 'anim-heartbeat' },
  { id: 'kiss', art: '💋', label: 'Kiss', hint: 'umma', animation: 'anim-float' },
  { id: 'need_you', art: '🫂', label: 'Need You', animation: 'anim-pulse' },
];

const FRIEND: Sticker[] = [
  { id: 'cheers', art: '👋', label: 'Cheers', animation: 'anim-wiggle' },
  { id: 'good_job', art: '😄', label: 'Good Job', animation: 'anim-pulse' },
  { id: 'awesome', art: '🔥', label: 'Awesome', animation: 'anim-float' },
  { id: 'lol', art: '😂', label: 'LOL', animation: 'anim-wiggle' },
  { id: 'thanks_friend', art: '🙌', label: 'Thanks', animation: 'anim-pulse' },
];

const FAMILY: Sticker[] = [
  { id: 'thanks_family', art: '❤️', label: 'Thanks', animation: 'anim-heartbeat' },
  { id: 'take_care', art: '🤗', label: 'Take Care', animation: 'anim-wiggle' },
  { id: 'blessings', art: '🙏', label: 'Blessings', animation: 'anim-pulse' },
  { id: 'help_me', art: '🫶', label: 'Help Me', animation: 'anim-heartbeat' },
  { id: 'home', art: '🏠', label: 'Home', animation: 'anim-float' },
];

const BY_RELATIONSHIP: Record<Relationship, Sticker[]> = {
  partner: PARTNER,
  friend: FRIEND,
  family: FAMILY,
};

/** The actions available in this kind of space. */
export function actionsFor(relationship: Relationship): Sticker[] {
  return BY_RELATIONSHIP[relationship] ?? PARTNER;
}

/**
 * The headline action for a relationship — the one that gets the big button,
 * the way Miss You used to for couples.
 */
export function primaryActionFor(relationship: Relationship): Sticker {
  return actionsFor(relationship)[relationship === 'partner' ? 1 : 0];
}

// Every action across every relationship, for looking one up by id: history
// keeps the id of whatever was sent, including from a relationship that has
// since been changed.
const BY_ID = new Map([...PARTNER, ...FRIEND, ...FAMILY].map((s) => [s.id, s]));

/** Falls back to a heart, so an unknown id still reads as something kind. */
export function stickerFor(id: string | undefined): Sticker {
  return (id && BY_ID.get(id)) || { id: id ?? 'love', art: '❤️', label: 'Love' };
}

/** Kept for the widget card and anywhere a default set is needed. */
export const STICKERS = PARTNER;
