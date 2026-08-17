// Package websocket carries the Anivi realtime session: one persistent socket
// per open app, joined to exactly one room.
package websocket

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/anivi/server/pairing"
	"github.com/anivi/server/protocol"
	"github.com/anivi/server/room"
	"github.com/gorilla/websocket"
)

const (
	// writeWait is how long a single write may block before the peer is
	// considered gone.
	writeWait = 10 * time.Second
	// pongWait is how long we tolerate silence from a client. Anything longer
	// and the connection is treated as dead — this is what catches a phone
	// that walked out of Wi-Fi range without closing the socket.
	pongWait = 60 * time.Second
	// pingPeriod must be meaningfully shorter than pongWait so a client gets
	// several chances to answer.
	pingPeriod = 25 * time.Second
	// maxMessageSize caps a single inbound frame (a long stroke is a few KB).
	maxMessageSize = 256 * 1024
	// sendBuffer is how many outbound messages may queue for a slow client
	// before we drop it rather than let the room block on it.
	sendBuffer = 256
)

// Persister is the subset of the store the realtime layer needs. It is an
// interface (and may be nil) so chat degrades to live-only when no database is
// configured, instead of taking the socket down with it.
type Persister interface {
	SaveMessage(ctx context.Context, msg protocol.ChatMessage) error
	Messages(ctx context.Context, roomID string, before int64, limit int) ([]protocol.ChatMessage, bool, error)
	SaveRoom(ctx context.Context, roomID, loveCode string) error
}

// AttachmentLinker mints a readable URL for a stored attachment key.
type AttachmentLinker interface {
	URL(ctx context.Context, key string) (string, error)
}

// Client is one device's connection.
type Client struct {
	hub    *room.Hub
	store  Persister
	media  AttachmentLinker
	conn   *websocket.Conn
	send   chan []byte
	connID string
	userID string
	room   *room.Room
	closed chan struct{}
	// missYou throttles the Miss You button. Only readPump touches it.
	missYou missYouGate
	// lastNudge throttles sticker taps. Only readPump touches it.
	lastNudge time.Time
}

func newClient(hub *room.Hub, store Persister, media AttachmentLinker, conn *websocket.Conn) *Client {
	return &Client{
		hub:    hub,
		store:  store,
		media:  media,
		conn:   conn,
		send:   make(chan []byte, sendBuffer),
		connID: pairing.StrokeID(),
		closed: make(chan struct{}),
	}
}

// ConnID implements room.Subscriber.
func (c *Client) ConnID() string { return c.connID }

// UserID implements room.Subscriber.
func (c *Client) UserID() string { return c.userID }

// Send implements room.Subscriber. It never blocks: a client that cannot keep
// up is disconnected and left to reconnect, which restores state anyway.
func (c *Client) Send(msg []byte) {
	select {
	case c.send <- msg:
	default:
		c.dropSlow()
	}
}

func (c *Client) dropSlow() {
	select {
	case <-c.closed:
	default:
		close(c.closed)
	}
}

func (c *Client) sendEnvelope(e protocol.Envelope) {
	b, err := json.Marshal(e)
	if err != nil {
		log.Printf("anivi: marshal %s: %v", e.Type, err)
		return
	}
	c.Send(b)
}

func (c *Client) sendError(code, message string) {
	c.sendEnvelope(protocol.Envelope{Type: protocol.TypeError, Code: code, Message: message})
}

// readPump owns the connection's read side and, by extension, its lifetime.
func (c *Client) readPump() {
	defer func() {
		c.leaveRoom()
		c.conn.Close()
		c.dropSlow()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	// Any protocol-level pong keeps the connection alive. Application-level
	// "pong" messages do the same in handleMessage, for clients (browsers)
	// that cannot see or send protocol frames.
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("anivi: read %s: %v", c.connID, err)
			}
			return
		}
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))

		var env protocol.Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			c.sendError(protocol.ErrBadMessage, "could not parse message")
			continue
		}
		c.handleMessage(env)
	}
}

// writePump owns every write to the connection, including the heartbeat, so
// that gorilla's one-writer-at-a-time rule is never violated.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			// Protocol-level ping for native clients...
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
			// ...and an application-level ping, because browsers expose no way
			// to observe protocol pings or reply to them explicitly.
			b, _ := json.Marshal(protocol.Envelope{
				Type:      protocol.TypePing,
				Timestamp: time.Now().UnixMilli(),
			})
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.TextMessage, b); err != nil {
				return
			}
		case <-c.closed:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			_ = c.conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return
		}
	}
}

func (c *Client) leaveRoom() {
	if c.room == nil {
		return
	}
	r := c.room
	c.room = nil
	online := r.Leave(c)
	broadcastPresence(r, online)
}

func broadcastPresence(r *room.Room, online int) {
	b, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypePresence,
		RoomID:    r.ID,
		Online:    online,
		Paired:    r.Paired(),
		Timestamp: time.Now().UnixMilli(),
	})
	if err != nil {
		return
	}
	r.Broadcast(b, "")
}
