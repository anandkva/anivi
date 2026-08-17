package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/anivi/server/pairing"
	"github.com/anivi/server/protocol"
	"github.com/anivi/server/room"
	"github.com/anivi/server/store"
	"github.com/gorilla/websocket"
)

const (
	maxPointsPerStroke = 4096
	missYouCooldown    = 1500 * time.Millisecond
)

// Handler upgrades an HTTP request into an Anivi realtime session.
// allowedOrigin decides which browser origins may connect; native clients send
// no Origin header and are always allowed.
//
// store and media may be nil: without them chat is live-only and attachments
// are unavailable, but drawing and Miss You are unaffected.
func Handler(hub *room.Hub, store Persister, media AttachmentLinker, originAllowed func(string) bool) http.HandlerFunc {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  4096,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			if origin == "" {
				return true
			}
			return originAllowed(origin)
		},
	}

	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			// Upgrade already wrote an error response.
			return
		}
		c := newClient(hub, store, media, conn)
		go c.writePump()

		// A client may pass its pairing in the query string so that a
		// reconnect needs no extra round trip.
		if roomID := r.URL.Query().Get("roomId"); roomID != "" {
			c.handleMessage(protocol.Envelope{
				Type:     protocol.TypeJoin,
				RoomID:   roomID,
				UserID:   r.URL.Query().Get("userId"),
				LoveCode: r.URL.Query().Get("loveCode"),
			})
		}
		c.readPump()
	}
}

type missYouGate struct{ last time.Time }

func (c *Client) handleMessage(env protocol.Envelope) {
	switch env.Type {
	case protocol.TypeJoin:
		c.handleJoin(env)
		return
	case protocol.TypePong:
		// The read deadline was already extended by readPump.
		return
	case protocol.TypePing:
		c.sendEnvelope(protocol.Envelope{Type: protocol.TypePong, Timestamp: time.Now().UnixMilli()})
		return
	}

	r := c.room
	if r == nil {
		c.sendError(protocol.ErrNotJoined, "join a room first")
		return
	}

	switch env.Type {
	case protocol.TypeDraw:
		c.handleDraw(r, env)
	case protocol.TypeUndo:
		c.handleUndo(r, env)
	case protocol.TypeClear:
		c.handleClear(r)
	case protocol.TypeSync:
		c.sendState(r)
	case protocol.TypeMissYou:
		c.handleMissYou(r)
	case protocol.TypeChat:
		c.handleChat(r, env)
	case protocol.TypeNudge:
		c.handleNudge(r, env)
	case protocol.TypeChatHistory:
		c.handleChatHistory(r, env)
	default:
		c.sendError(protocol.ErrBadMessage, "unknown message type: "+env.Type)
	}
}

func (c *Client) handleJoin(env protocol.Envelope) {
	var (
		r   *room.Room
		err error
	)
	switch {
	case env.RoomID != "":
		r, err = c.hub.ByID(env.RoomID)
		if err != nil && env.LoveCode != "" {
			// The room is gone (server restart, or an idle host that shut the
			// process down). A client holding both the room id and the Love
			// Code may re-open its space rather than having to pair again.
			r, err = c.hub.Reclaim(env.RoomID, env.LoveCode)
		}
	case env.LoveCode != "":
		code := pairing.NormalizeLoveCode(env.LoveCode)
		if code == "" {
			c.sendError(protocol.ErrRoomNotFound, "that Love Code doesn't look right")
			return
		}
		r, err = c.hub.ByCode(code)
		if err != nil {
			// The partner may be joining a space this process has not loaded
			// since it restarted. The database still knows the pairing.
			r, err = c.reviveFromStore(code)
		}
	default:
		c.sendError(protocol.ErrBadMessage, "join needs a roomId or a loveCode")
		return
	}
	if err != nil {
		c.sendError(protocol.ErrRoomNotFound, "that space no longer exists")
		return
	}

	// Rejoining the same room (after a sync request, say) should not stack
	// subscriptions.
	if c.room != nil {
		c.leaveRoom()
	}

	c.userID = env.UserID
	if c.userID == "" {
		c.userID = pairing.UserID()
	}
	c.room = r
	online := r.Join(c)

	// Keep the durable record fresh, so this pairing can be rebuilt after a
	// restart even if neither partner has the room id to hand.
	c.rememberRoom(r)

	c.sendEnvelope(protocol.Envelope{
		Type:      protocol.TypeJoined,
		RoomID:    r.ID,
		LoveCode:  r.LoveCode,
		UserID:    c.userID,
		Online:    online,
		Paired:    r.Paired(),
		Timestamp: time.Now().UnixMilli(),
	})
	c.sendState(r)
	broadcastPresence(r, online)
}

// reviveFromStore rebuilds a room from its durable record when this process
// has never heard of the Love Code — the case where the partner reconnects
// first after a restart.
func (c *Client) reviveFromStore(loveCode string) (*room.Room, error) {
	if c.store == nil {
		return nil, room.ErrNotFound
	}
	finder, ok := c.store.(interface {
		RoomByCode(ctx context.Context, loveCode string) (store.RoomRecord, error)
	})
	if !ok {
		return nil, room.ErrNotFound
	}

	ctx, cancel := context.WithTimeout(context.Background(), persistTimeout)
	defer cancel()

	rec, err := finder.RoomByCode(ctx, loveCode)
	if err != nil {
		return nil, room.ErrNotFound
	}
	return c.hub.Reclaim(rec.RoomID, rec.LoveCode)
}

// rememberRoom records the pairing so it outlives this process.
func (c *Client) rememberRoom(r *room.Room) {
	if c.store == nil {
		return
	}
	roomID, loveCode := r.ID, r.LoveCode
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), persistTimeout)
		defer cancel()
		if err := c.store.SaveRoom(ctx, roomID, loveCode); err != nil {
			log.Printf("anivi: save room %s: %v", roomID, err)
		}
	}()
}

// sendState replays the whole room so a fresh or reconnected client draws
// exactly what its partner sees.
func (c *Client) sendState(r *room.Room) {
	activity := r.LastActivity()
	c.sendEnvelope(protocol.Envelope{
		Type:      protocol.TypeState,
		RoomID:    r.ID,
		Strokes:   r.Strokes(),
		Activity:  &activity,
		Online:    r.Online(),
		Paired:    r.Paired(),
		Timestamp: time.Now().UnixMilli(),
	})
}

func (c *Client) handleDraw(r *room.Room, env protocol.Envelope) {
	if env.Stroke == nil || len(env.Stroke.Points) == 0 {
		c.sendError(protocol.ErrBadMessage, "draw needs a stroke with points")
		return
	}
	s := sanitizeStroke(*env.Stroke, c.userID)
	r.AddStroke(s)
	r.Touch(c.userID)

	b, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypeDraw,
		RoomID:    r.ID,
		UserID:    c.userID,
		Stroke:    &s,
		Timestamp: time.Now().UnixMilli(),
	})
	if err != nil {
		log.Printf("anivi: marshal draw: %v", err)
		return
	}
	// The sender already rendered this stroke locally.
	r.Broadcast(b, c.connID)
}

func (c *Client) handleUndo(r *room.Room, env protocol.Envelope) {
	var (
		strokeID string
		ok       bool
	)
	if env.StrokeID != "" {
		strokeID, ok = env.StrokeID, r.RemoveStroke(env.StrokeID)
	} else {
		strokeID, ok = r.Undo(c.userID)
	}
	if !ok {
		return
	}
	b, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypeUndo,
		RoomID:    r.ID,
		UserID:    c.userID,
		StrokeID:  strokeID,
		Timestamp: time.Now().UnixMilli(),
	})
	if err != nil {
		return
	}
	// Sent to everyone: the server decides which stroke actually disappeared.
	r.Broadcast(b, "")
}

func (c *Client) handleClear(r *room.Room) {
	r.Clear(c.userID)
	b, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypeClear,
		RoomID:    r.ID,
		UserID:    c.userID,
		Timestamp: time.Now().UnixMilli(),
	})
	if err != nil {
		return
	}
	r.Broadcast(b, "")
}

func (c *Client) handleMissYou(r *room.Room) {
	now := time.Now()
	if now.Sub(c.missYou.last) < missYouCooldown {
		c.sendError(protocol.ErrRateLimited, "one heart at a time ❤️")
		return
	}
	c.missYou.last = now

	activity := protocol.Activity{
		Kind:      protocol.TypeMissYou,
		UserID:    c.userID,
		Text:      "They miss you ❤️",
		Timestamp: now.UnixMilli(),
	}
	r.SetActivity(activity)
	r.Touch(c.userID)

	b, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypeMissYou,
		RoomID:    r.ID,
		UserID:    c.userID,
		Activity:  &activity,
		Timestamp: now.UnixMilli(),
	})
	if err != nil {
		return
	}
	r.Broadcast(b, c.connID)
}

// sanitizeStroke keeps a hostile or buggy client from poisoning the shared
// room: coordinates are clamped to the normalized canvas, the author is taken
// from the connection rather than the payload, and sizes are bounded.
func sanitizeStroke(s protocol.Stroke, userID string) protocol.Stroke {
	if s.ID == "" {
		s.ID = pairing.StrokeID()
	} else if len(s.ID) > 64 {
		s.ID = s.ID[:64]
	}
	s.UserID = userID

	if s.Tool != protocol.ToolEraser {
		s.Tool = protocol.ToolPen
	}
	if len(s.Color) > 32 {
		s.Color = s.Color[:32]
	}
	if s.Color == "" {
		s.Color = "#ff5c8a"
	}
	if s.Width <= 0 || s.Width > 0.5 {
		s.Width = 0.006
	}

	if len(s.Points) > maxPointsPerStroke {
		s.Points = s.Points[:maxPointsPerStroke]
	}
	for i := range s.Points {
		s.Points[i].X = clamp01(s.Points[i].X)
		s.Points[i].Y = clamp01(s.Points[i].Y)
	}
	return s
}

func clamp01(v float64) float64 {
	// NaN fails both comparisons, so send it to the origin rather than
	// letting it reach a canvas.
	switch {
	case v != v:
		return 0
	case v < 0:
		return 0
	case v > 1:
		return 1
	}
	return v
}
