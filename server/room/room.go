package room

import (
	"sync"
	"time"

	"github.com/anivi/server/protocol"
)

// maxStrokes bounds a room's history so a long drawing session cannot grow
// memory without limit. The oldest strokes are dropped first.
const maxStrokes = 3000

// maxPreviewBytes bounds the canvas snapshot the main app uploads for the
// Home Screen widgets.
const maxPreviewBytes = 512 * 1024

// Subscriber is one connected device. The websocket package implements it;
// keeping it an interface lets room stay free of transport concerns.
type Subscriber interface {
	// ConnID identifies this connection (not the user: a user may briefly have
	// two connections while reconnecting).
	ConnID() string
	UserID() string
	// Send queues an already-encoded message. It must not block.
	Send(msg []byte)
}

// Preview is the compressed canvas snapshot shown by the widgets.
type Preview struct {
	Data      []byte
	Mime      string
	UpdatedAt int64
}

// Room is one couple's private space.
type Room struct {
	ID        string
	LoveCode  string
	CreatedAt time.Time

	mu           sync.RWMutex
	subs         map[string]Subscriber
	members      map[string]time.Time // userID -> last seen
	strokes      []protocol.Stroke
	lastActivity protocol.Activity
	preview      Preview
	card         Preview
	nudges       map[string]pendingNudge
	emptySince   time.Time
}

// pendingNudge is a sticker one partner has sent and the other has not
// answered yet.
type pendingNudge struct {
	userID string
	at     time.Time
}

func newRoom(id, loveCode string) *Room {
	now := time.Now()
	return &Room{
		ID:         id,
		LoveCode:   loveCode,
		CreatedAt:  now,
		subs:       make(map[string]Subscriber),
		members:    make(map[string]time.Time),
		nudges:     make(map[string]pendingNudge),
		emptySince: now,
		lastActivity: protocol.Activity{
			Kind:      "created",
			Text:      "Your space is ready ❤️",
			Timestamp: now.UnixMilli(),
		},
	}
}

// Join registers a connection and returns the number of connections now online.
func (r *Room) Join(s Subscriber) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.subs[s.ConnID()] = s
	r.members[s.UserID()] = time.Now()
	r.emptySince = time.Time{}
	return len(r.subs)
}

// Leave removes a connection and returns the number still online.
func (r *Room) Leave(s Subscriber) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.subs, s.ConnID())
	n := len(r.subs)
	if n == 0 {
		r.emptySince = time.Now()
	}
	return n
}

// Online reports how many connections are currently attached.
func (r *Room) Online() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.subs)
}

// Paired reports whether two distinct devices have ever joined this room.
// It stays true after a partner disconnects — pairing outlives connectivity.
func (r *Room) Paired() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.members) >= 2
}

// Broadcast sends msg to every connection except exceptConnID (pass "" to
// include everyone).
func (r *Room) Broadcast(msg []byte, exceptConnID string) {
	r.mu.RLock()
	targets := make([]Subscriber, 0, len(r.subs))
	for id, s := range r.subs {
		if id == exceptConnID {
			continue
		}
		targets = append(targets, s)
	}
	r.mu.RUnlock()

	for _, s := range targets {
		s.Send(msg)
	}
}

// AddStroke records a stroke. A stroke is upserted by id rather than appended
// blindly, because clients stream a stroke while the finger is still down:
// each update carries the same id and the points so far.
func (r *Room) AddStroke(s protocol.Stroke) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.strokes {
		if r.strokes[i].ID == s.ID {
			r.strokes[i] = s
			r.lastActivity = protocol.Activity{
				Kind:      protocol.TypeDraw,
				UserID:    s.UserID,
				Text:      "New drawing ✏️",
				Timestamp: time.Now().UnixMilli(),
			}
			return
		}
	}
	r.strokes = append(r.strokes, s)
	if len(r.strokes) > maxStrokes {
		r.strokes = append([]protocol.Stroke(nil), r.strokes[len(r.strokes)-maxStrokes:]...)
	}
	r.lastActivity = protocol.Activity{
		Kind:      protocol.TypeDraw,
		UserID:    s.UserID,
		Text:      "New drawing ✏️",
		Timestamp: time.Now().UnixMilli(),
	}
}

// Undo removes that user's most recent stroke and reports which one went away.
func (r *Room) Undo(userID string) (strokeID string, ok bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := len(r.strokes) - 1; i >= 0; i-- {
		if r.strokes[i].UserID != userID {
			continue
		}
		strokeID = r.strokes[i].ID
		r.strokes = append(r.strokes[:i], r.strokes[i+1:]...)
		return strokeID, true
	}
	return "", false
}

// RemoveStroke deletes a stroke by id regardless of author.
func (r *Room) RemoveStroke(strokeID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.strokes {
		if r.strokes[i].ID == strokeID {
			r.strokes = append(r.strokes[:i], r.strokes[i+1:]...)
			return true
		}
	}
	return false
}

// Clear empties the shared canvas.
func (r *Room) Clear(userID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.strokes = nil
	r.lastActivity = protocol.Activity{
		Kind:      protocol.TypeClear,
		UserID:    userID,
		Text:      "Canvas cleared 🧹",
		Timestamp: time.Now().UnixMilli(),
	}
}

// Strokes returns a copy of the room history.
func (r *Room) Strokes() []protocol.Stroke {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]protocol.Stroke, len(r.strokes))
	copy(out, r.strokes)
	return out
}

// Nudge records that userID reached out with a sticker, and reports whether
// that answers the partner's own pending nudge.
//
// This is what turns a sticker into something mutual: the first tap waits, and
// the same sticker coming back from the other side within the window is a
// match — a hug only happens when both people hug.
func (r *Room) Nudge(sticker, userID string, window time.Duration) (matched bool) {
	now := time.Now()

	r.mu.Lock()
	defer r.mu.Unlock()

	// Drop anything nobody answered in time, so the map cannot grow with
	// stickers that were never reciprocated.
	for name, p := range r.nudges {
		if now.Sub(p.at) > window {
			delete(r.nudges, name)
		}
	}

	if p, ok := r.nudges[sticker]; ok && p.userID != userID {
		// The partner was waiting for exactly this.
		delete(r.nudges, sticker)
		return true
	}

	// Either nobody was waiting, or this is the same person tapping again —
	// refresh their wait rather than matching them with themselves.
	r.nudges[sticker] = pendingNudge{userID: userID, at: now}
	return false
}

// PendingNudge reports whether someone is still waiting on this sticker.
func (r *Room) PendingNudge(sticker string, window time.Duration) (userID string, waiting bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.nudges[sticker]
	if !ok || time.Since(p.at) > window {
		return "", false
	}
	return p.userID, true
}

// SetActivity records the latest room event (used by Miss You).
func (r *Room) SetActivity(a protocol.Activity) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lastActivity = a
}

// LastActivity returns the most recent room event.
func (r *Room) LastActivity() protocol.Activity {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.lastActivity
}

// Touch marks a user as recently active.
func (r *Room) Touch(userID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.members[userID] = time.Now()
}

// SetPreview stores the canvas snapshot uploaded by a main app for the widgets.
func (r *Room) SetPreview(data []byte, mime string) bool {
	if len(data) == 0 || len(data) > maxPreviewBytes {
		return false
	}
	buf := make([]byte, len(data))
	copy(buf, data)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.preview = Preview{Data: buf, Mime: mime, UpdatedAt: time.Now().UnixMilli()}
	return true
}

// Preview returns the latest canvas snapshot, if any.
func (r *Room) Preview() (Preview, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if len(r.preview.Data) == 0 {
		return Preview{}, false
	}
	return r.preview, true
}

// SetCard stores the fully composed widget card (drawing plus the activity
// line). Home Screen widgets that can only display an image show this.
func (r *Room) SetCard(data []byte, mime string) bool {
	if len(data) == 0 || len(data) > maxPreviewBytes {
		return false
	}
	buf := make([]byte, len(data))
	copy(buf, data)
	r.mu.Lock()
	defer r.mu.Unlock()
	r.card = Preview{Data: buf, Mime: mime, UpdatedAt: time.Now().UnixMilli()}
	return true
}

// Card returns the latest composed widget card, if any.
func (r *Room) Card() (Preview, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if len(r.card.Data) == 0 {
		return Preview{}, false
	}
	return r.card, true
}
