package websocket

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/anivi/server/protocol"
	"github.com/anivi/server/push"
	"github.com/anivi/server/room"
	"github.com/anivi/server/store"
)

// Notifier reaches a person whose app is closed.
//
// It is an interface so the socket layer stays testable without a push
// service, and nil-able so a server without VAPID keys simply doesn't notify.
type Notifier interface {
	// Notify sends to every device belonging to userID.
	Notify(ctx context.Context, userID string, n push.Notification)
}

const notifyTimeout = 10 * time.Second

// notifyPeer sends a push to the other member of this room, but only when they
// are not already looking at it.
//
// Someone with the app open has just seen the message arrive; buzzing their
// phone as well is noise. This is why the check is on the live room rather
// than on the socket that sent it.
func (c *Client) notifyPeer(r *room.Room, title, body string) {
	if c.notifier == nil || c.store == nil {
		return
	}

	finder, ok := c.store.(PeerFinder)
	if !ok {
		return
	}

	roomID, senderID := r.ID, c.userID
	// The peer counts as present only if a connection of theirs is attached to
	// this room right now.
	if r.HasUserOtherThan(senderID) {
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), notifyTimeout)
		defer cancel()

		peerID, err := finder.PeerOf(ctx, roomID, senderID)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				log.Printf("anivi: no peer for room %s: %v", roomID, err)
			}
			return
		}

		c.notifier.Notify(ctx, peerID, push.Notification{
			Title:  title,
			Body:   body,
			RoomID: roomID,
			// One tag per room: a second message replaces the first rather
			// than stacking a pile of buzzes on the lock screen.
			Tag: "anivi-" + roomID,
		})
	}()
}

// PeerFinder resolves the other member of a room, and names an account.
type PeerFinder interface {
	PeerOf(ctx context.Context, roomID, userID string) (string, error)
	UserByID(ctx context.Context, userID string) (store.UserRecord, error)
}

// displayName is what the notification is titled with: the sender's name, so
// the recipient knows who it is without the message being in it.
func (c *Client) displayName() string {
	finder, ok := c.store.(PeerFinder)
	if !ok || c.userID == "" {
		return "Anivi"
	}
	ctx, cancel := context.WithTimeout(context.Background(), notifyTimeout)
	defer cancel()

	user, err := finder.UserByID(ctx, c.userID)
	if err != nil || user.Name == "" {
		return "Anivi"
	}
	return user.Name
}

// notificationFor describes a chat message without repeating it.
//
// The body deliberately never contains the message: the conversation is
// encrypted at rest precisely so it does not sit in readable form anywhere,
// and a push payload travels through a third-party push service and lands on a
// lock screen.
func notificationFor(msg protocol.ChatMessage, senderName string) (title, body string) {
	title = senderName
	if title == "" {
		title = "Anivi"
	}
	switch msg.Kind {
	case protocol.ChatImage:
		return title, "Sent a photo 📷"
	case protocol.ChatSticker:
		return title, "Sent you something 💌"
	default:
		return title, "Sent you a message 💬"
	}
}
