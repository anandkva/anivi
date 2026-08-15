// Package protocol defines the Anivi realtime wire format.
//
// The same shapes are mirrored in web/src/lib/protocol.ts, ios/Anivi/Protocol.swift
// and android/Anivi/app/src/main/java/app/anivi/net/Protocol.kt. Keep them in sync.
package protocol

// Message types sent by clients.
const (
	TypeJoin    = "join"
	TypeDraw    = "draw"
	TypeUndo    = "undo"
	TypeClear   = "clear"
	TypeSync    = "sync"
	TypeMissYou = "miss_you"
	TypePing    = "ping"
	TypePong    = "pong"
)

// Message types sent by the server (in addition to the echoed types above).
const (
	TypeJoined   = "joined"
	TypeState    = "state"
	TypePresence = "presence"
	TypeError    = "error"
)

// Tools understood by the canvas.
const (
	ToolPen    = "pen"
	ToolEraser = "eraser"
)

// Point is a canvas coordinate normalized to [0,1] so that every device
// renders the same stroke regardless of screen size.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Stroke is one continuous pen/eraser gesture.
type Stroke struct {
	ID     string  `json:"id"`
	UserID string  `json:"userId"`
	Tool   string  `json:"tool"`
	Color  string  `json:"color"`
	Width  float64 `json:"width"`
	Points []Point `json:"points"`
}

// Activity is the most recent thing that happened in a room. It is what the
// Home Screen widgets display.
type Activity struct {
	Kind      string `json:"kind"`
	UserID    string `json:"userId"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
}

// Envelope is the single message shape used in both directions. Fields not
// relevant to a given type are omitted.
type Envelope struct {
	Type     string    `json:"type"`
	RoomID   string    `json:"roomId,omitempty"`
	UserID   string    `json:"userId,omitempty"`
	LoveCode string    `json:"loveCode,omitempty"`
	Stroke   *Stroke   `json:"stroke,omitempty"`
	StrokeID string    `json:"strokeId,omitempty"`
	Strokes  []Stroke  `json:"strokes,omitempty"`
	Activity *Activity `json:"activity,omitempty"`
	// Online is the number of connected devices in the room (0-2 in practice).
	// Not omitempty: "zero partners online" is meaningful, not absent.
	Online int `json:"online"`
	// Paired reports whether both partners have ever joined this room.
	Paired    bool   `json:"paired"`
	Timestamp int64  `json:"timestamp,omitempty"`
	Message   string `json:"message,omitempty"`
	Code      string `json:"code,omitempty"`
}

// Error codes returned in Envelope.Code.
const (
	ErrBadMessage   = "bad_message"
	ErrRoomNotFound = "room_not_found"
	ErrNotJoined    = "not_joined"
	ErrRateLimited  = "rate_limited"
)
