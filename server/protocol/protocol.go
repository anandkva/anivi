// Package protocol defines the Anivi realtime wire format.
//
// The same shapes are mirrored in web/src/lib/protocol.ts, ios/Anivi/Protocol.swift
// and android/Anivi/app/src/main/java/app/anivi/net/Protocol.kt. Keep them in sync.
package protocol

// Message types sent by clients.
const (
	TypeJoin        = "join"
	TypeDraw        = "draw"
	TypeUndo        = "undo"
	TypeClear       = "clear"
	TypeSync        = "sync"
	TypeMissYou     = "miss_you"
	TypeChat        = "chat"
	TypeChatHistory = "chat_history"
	TypeChatRead    = "chat_read"
	TypePing        = "ping"
	TypePong        = "pong"
)

// Chat message kinds.
const (
	ChatText    = "text"
	ChatSticker = "sticker"
	ChatImage   = "image"
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

// Attachment is an image stored in object storage. Only the key is
// authoritative; the URL is minted fresh whenever the message is read, so a
// link in an old message never rots.
type Attachment struct {
	Key    string `json:"key" bson:"key"`
	URL    string `json:"url" bson:"-"`
	Mime   string `json:"mime" bson:"mime"`
	Size   int64  `json:"size" bson:"size"`
	Width  int    `json:"width,omitempty" bson:"width,omitempty"`
	Height int    `json:"height,omitempty" bson:"height,omitempty"`
}

// ChatMessage is one entry in a room's conversation.
type ChatMessage struct {
	ID     string `json:"id" bson:"id"`
	RoomID string `json:"roomId" bson:"roomId"`
	UserID string `json:"userId" bson:"userId"`
	// Kind is text, sticker or image.
	Kind string `json:"kind" bson:"kind"`
	Text string `json:"text,omitempty" bson:"text,omitempty"`
	// Sticker names a piece of clipart both clients know how to draw, e.g.
	// "miss_you" or "hug". The art lives in the client, not the database.
	Sticker    string      `json:"sticker,omitempty" bson:"sticker,omitempty"`
	Attachment *Attachment `json:"attachment,omitempty" bson:"attachment,omitempty"`
	CreatedAt  int64       `json:"createdAt" bson:"createdAt"`
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

	// Chat carries a single message; Messages carries a page of history,
	// oldest first. Before/Limit page backwards through it.
	Chat     *ChatMessage  `json:"chat,omitempty"`
	Messages []ChatMessage `json:"messages,omitempty"`
	Before   int64         `json:"before,omitempty"`
	Limit    int           `json:"limit,omitempty"`
	HasMore  bool          `json:"hasMore,omitempty"`
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
