package websocket

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/anivi/server/protocol"
	"github.com/anivi/server/room"
)

// typingCooldown throttles typing frames from one client. Clients also
// throttle, but the server should not depend on them behaving.
const typingCooldown = 900 * time.Millisecond

// ReadMarker persists how far someone has read.
type ReadMarker interface {
	MarkRead(ctx context.Context, roomID, userID string, readAt int64) error
	ReadAt(ctx context.Context, roomID, userID string) (int64, error)
}

// handleTyping tells the partner that someone is composing.
//
// Nothing is stored: typing is true only for the seconds it is true, and a
// record of when somebody hesitated is not something Anivi should keep.
func (c *Client) handleTyping(r *room.Room, env protocol.Envelope) {
	now := time.Now()
	if env.Typing && now.Sub(c.lastTyping) < typingCooldown {
		return
	}
	c.lastTyping = now

	out, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypeTyping,
		RoomID:    r.ID,
		UserID:    c.userID,
		Typing:    env.Typing,
		Timestamp: now.UnixMilli(),
	})
	if err != nil {
		return
	}
	// Only the partner: you know perfectly well that you are typing.
	r.Broadcast(out, c.connID)
}

// handleRead records how far this person has read and tells the partner, so
// their own messages can show as seen.
func (c *Client) handleRead(r *room.Room, env protocol.Envelope) {
	readAt := env.ReadAt
	if readAt <= 0 {
		readAt = time.Now().UnixMilli()
	}

	out, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypeRead,
		RoomID:    r.ID,
		UserID:    c.userID,
		ReadAt:    readAt,
		Timestamp: time.Now().UnixMilli(),
	})
	if err == nil {
		r.Broadcast(out, c.connID)
	}

	marker, ok := c.store.(ReadMarker)
	if !ok {
		return
	}
	roomID, userID := r.ID, c.userID
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), persistTimeout)
		defer cancel()
		if err := marker.MarkRead(ctx, roomID, userID, readAt); err != nil {
			log.Printf("anivi: mark read %s: %v", roomID, err)
		}
	}()
}
