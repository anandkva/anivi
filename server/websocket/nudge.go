package websocket

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/anivi/server/pairing"
	"github.com/anivi/server/protocol"
	"github.com/anivi/server/room"
)

const (
	// nudgeWindow is how long a sticker waits for an answer. Long enough that
	// a partner can pick up their phone; short enough that a hug is a reply,
	// not something they stumble into an hour later.
	nudgeWindow = 3 * time.Minute
	// nudgeCooldown throttles one client's taps.
	nudgeCooldown = 700 * time.Millisecond
	// maxLabelRunes bounds the client-supplied wording used for the widget.
	maxLabelRunes = 40
)

// handleNudge delivers a sticker as an invitation rather than a message.
//
// The first tap reaches the partner as "they want a hug". The same sticker
// coming back completes it, and both sides are told at once so the animation
// plays together.
func (c *Client) handleNudge(r *room.Room, env protocol.Envelope) {
	sticker := strings.TrimSpace(env.Sticker)
	if sticker == "" || len(sticker) > maxStickerName {
		c.sendError(protocol.ErrBadMessage, "unknown sticker")
		return
	}

	now := time.Now()
	if now.Sub(c.lastNudge) < nudgeCooldown {
		c.sendError(protocol.ErrRateLimited, "one at a time ❤️")
		return
	}
	c.lastNudge = now

	label := trimRunes(strings.TrimSpace(env.Label), maxLabelRunes)
	matched := r.Nudge(sticker, c.userID, nudgeWindow)
	r.Touch(c.userID)

	// An emotion is kept, not just felt: it belongs in the Emotions tab, it
	// counts towards a badge when it is missed, and it puts the connection at
	// the top of Home like any other arrival.
	emotion := protocol.ChatMessage{
		ID:        "emo_" + pairing.StrokeID(),
		RoomID:    r.ID,
		UserID:    c.userID,
		Kind:      protocol.ChatEmotion,
		Sticker:   sticker,
		Text:      label,
		CreatedAt: now.UnixMilli(),
	}
	c.persist(emotion)

	msgType := protocol.TypeNudge
	if matched {
		msgType = protocol.TypeNudgeMatch
	}

	out, err := json.Marshal(protocol.Envelope{
		Type:      msgType,
		RoomID:    r.ID,
		UserID:    c.userID,
		Sticker:   sticker,
		Label:     label,
		Timestamp: now.UnixMilli(),
	})
	if err != nil {
		return
	}

	if matched {
		// Both sides, including the person who answered: the moment belongs to
		// the two of them, and the animation has to start on both screens.
		r.Broadcast(out, "")
	} else {
		// The sender already knows they are waiting.
		r.Broadcast(out, c.connID)
	}

	r.SetActivity(protocol.Activity{
		Kind:      msgType,
		UserID:    c.userID,
		Text:      activityForNudge(label, matched),
		Timestamp: now.UnixMilli(),
	})

	// A missed emotion should reach the phone, exactly like a missed message.
	// The label is the whole point here, so unlike chat it goes in the body.
	if !matched {
		c.notifyPeer(r, c.displayName(), sentEmotionLine(label))
	}
}

// sentEmotionLine is the notification body for an emotion. Naming it is the
// point — "sent you something" would waste the notification.
func sentEmotionLine(label string) string {
	if label == "" {
		return "Sent you an emotion 💌"
	}
	return "Sent you " + label
}

// activityForNudge is the Home Screen line. The wording comes from the client,
// so the server never has to know what a hug is called.
func activityForNudge(label string, matched bool) string {
	if label == "" {
		label = "💌"
	}
	if matched {
		return label + " 💞"
	}
	return label
}

func trimRunes(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}
