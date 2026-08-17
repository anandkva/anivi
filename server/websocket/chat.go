package websocket

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/anivi/server/pairing"
	"github.com/anivi/server/protocol"
	"github.com/anivi/server/room"
)

const (
	// maxChatRunes bounds a single message. Anivi is a place for little notes,
	// not essays, and the cap keeps one client from filling the room's history.
	maxChatRunes = 2000
	// maxStickerName bounds the clipart identifier.
	maxStickerName = 40
	// persistTimeout is how long a database write may take before the message
	// is delivered anyway. Delivery matters more than durability here.
	persistTimeout = 5 * time.Second
)

// handleChat delivers a chat message to the partner and stores it.
//
// Order matters: the partner sees the message first, and persistence happens
// in the background. A slow database should never make a conversation lag.
func (c *Client) handleChat(r *room.Room, env protocol.Envelope) {
	if env.Chat == nil {
		c.sendError(protocol.ErrBadMessage, "chat needs a message")
		return
	}

	msg, ok := c.sanitizeChat(r, *env.Chat)
	if !ok {
		return
	}

	// The wire copy carries a signed link so both sides render the image
	// immediately; the stored copy carries only the key. They are separate
	// values — sharing the Attachment pointer would both leak a temporary URL
	// into the database and race with the background write.
	outbound := c.withLink(msg)

	out, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypeChat,
		RoomID:    r.ID,
		UserID:    c.userID,
		Chat:      &outbound,
		Timestamp: msg.CreatedAt,
	})
	if err != nil {
		log.Printf("anivi: marshal chat: %v", err)
		return
	}
	// Echoed to the sender too, so both devices agree on the stored id and
	// timestamp rather than each inventing their own.
	r.Broadcast(out, "")

	r.Touch(c.userID)
	r.SetActivity(protocol.Activity{
		Kind:      protocol.TypeChat,
		UserID:    c.userID,
		Text:      activityLine(msg),
		Timestamp: msg.CreatedAt,
	})

	c.persist(msg)
}

// activityLine is what the Home Screen widget shows for a new message. The
// text itself is never included — a widget is visible to anyone holding the
// phone.
func activityLine(msg protocol.ChatMessage) string {
	switch msg.Kind {
	case protocol.ChatImage:
		return "New photo 📷"
	case protocol.ChatSticker:
		if msg.Sticker == "miss_you" {
			return "They miss you ❤️"
		}
		return "New sticker 💌"
	default:
		return "New message 💬"
	}
}

func (c *Client) persist(msg protocol.ChatMessage) {
	if c.store == nil {
		return
	}
	// Detached from the connection: the socket may be gone before Mongo
	// answers, and the message should still be saved.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), persistTimeout)
		defer cancel()
		if err := c.store.SaveMessage(ctx, msg); err != nil {
			log.Printf("anivi: save message %s: %v", msg.ID, err)
		}
	}()
}

// handleChatHistory returns a page of past messages, oldest first.
func (c *Client) handleChatHistory(r *room.Room, env protocol.Envelope) {
	if c.store == nil {
		// Without a database there is no history — say so plainly instead of
		// returning an empty page that looks like a wiped conversation.
		c.sendEnvelope(protocol.Envelope{
			Type:    protocol.TypeChatHistory,
			RoomID:  r.ID,
			HasMore: false,
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), persistTimeout)
	defer cancel()

	msgs, hasMore, err := c.store.Messages(ctx, r.ID, env.Before, env.Limit)
	if err != nil {
		log.Printf("anivi: history for %s: %v", r.ID, err)
		c.sendError(protocol.ErrBadMessage, "couldn't load your messages")
		return
	}
	for i := range msgs {
		msgs[i] = c.withLink(msgs[i])
	}

	c.sendEnvelope(protocol.Envelope{
		Type:     protocol.TypeChatHistory,
		RoomID:   r.ID,
		Messages: msgs,
		Before:   env.Before,
		HasMore:  hasMore,
	})
}

// withLink returns a copy of the message whose attachment carries a freshly
// minted, short-lived URL. Links are generated per read and expire, so nothing
// durable ever points at the bucket — an old photo still opens because the
// link is new, not because it was long-lived.
func (c *Client) withLink(msg protocol.ChatMessage) protocol.ChatMessage {
	if msg.Attachment == nil || msg.Attachment.Key == "" || c.media == nil {
		return msg
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	url, err := c.media.URL(ctx, msg.Attachment.Key)
	if err != nil {
		log.Printf("anivi: link for %s: %v", msg.Attachment.Key, err)
		return msg
	}
	// Copy the attachment so the caller's value (which may already be on its
	// way to the database) is untouched.
	attachment := *msg.Attachment
	attachment.URL = url
	msg.Attachment = &attachment
	return msg
}

// sanitizeChat decides what actually gets stored. The author, room and
// timestamp always come from the server, never from the payload.
func (c *Client) sanitizeChat(r *room.Room, in protocol.ChatMessage) (protocol.ChatMessage, bool) {
	out := protocol.ChatMessage{
		ID:        "msg_" + pairing.StrokeID(),
		RoomID:    r.ID,
		UserID:    c.userID,
		Kind:      in.Kind,
		CreatedAt: time.Now().UnixMilli(),
	}

	switch in.Kind {
	case protocol.ChatText:
		text := strings.TrimSpace(in.Text)
		if text == "" {
			c.sendError(protocol.ErrBadMessage, "message is empty")
			return out, false
		}
		if utf8.RuneCountInString(text) > maxChatRunes {
			// Truncate on a rune boundary rather than rejecting a long note.
			runes := []rune(text)
			text = string(runes[:maxChatRunes])
		}
		out.Text = text

	case protocol.ChatSticker:
		name := strings.TrimSpace(in.Sticker)
		if name == "" || len(name) > maxStickerName {
			c.sendError(protocol.ErrBadMessage, "unknown sticker")
			return out, false
		}
		// The art lives in the clients; the server only carries the name, so
		// it stays out of the business of what a hug looks like.
		out.Sticker = name

	case protocol.ChatImage:
		if in.Attachment == nil || in.Attachment.Key == "" {
			c.sendError(protocol.ErrBadMessage, "image needs an uploaded attachment")
			return out, false
		}
		// The key must belong to this room: a client cannot attach someone
		// else's photo by guessing a key.
		if !strings.HasPrefix(in.Attachment.Key, "rooms/"+r.ID+"/") {
			c.sendError(protocol.ErrBadMessage, "that attachment isn't from this space")
			return out, false
		}
		out.Attachment = &protocol.Attachment{
			Key:    in.Attachment.Key,
			Mime:   in.Attachment.Mime,
			Size:   in.Attachment.Size,
			Width:  in.Attachment.Width,
			Height: in.Attachment.Height,
		}
		out.Text = strings.TrimSpace(in.Text) // an optional caption

	default:
		c.sendError(protocol.ErrBadMessage, "unknown message kind: "+in.Kind)
		return out, false
	}

	return out, true
}
