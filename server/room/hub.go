package room

import (
	"errors"
	"regexp"
	"sync"
	"time"

	"github.com/anivi/server/pairing"
	"github.com/anivi/server/protocol"
)

// ErrNotFound is returned when no room matches a Love Code or room id.
var ErrNotFound = errors.New("room not found")

// idleTTL is how long an empty room is kept before it is reclaimed. Rooms live
// only in memory for the MVP, so this is the whole retention policy.
const idleTTL = 48 * time.Hour

// Hub owns every room. It is safe for concurrent use.
type Hub struct {
	mu      sync.RWMutex
	rooms   map[string]*Room
	byCode  map[string]*Room
	stopped chan struct{}
}

func NewHub() *Hub {
	return &Hub{
		rooms:   make(map[string]*Room),
		byCode:  make(map[string]*Room),
		stopped: make(chan struct{}),
	}
}

// Create allocates a new room with a fresh Love Code.
func (h *Hub) Create() *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	var code string
	for {
		code = pairing.LoveCode()
		if _, taken := h.byCode[code]; !taken {
			break
		}
	}
	r := newRoom(pairing.RoomID(), code)
	h.rooms[r.ID] = r
	h.byCode[r.LoveCode] = r
	return r
}

// roomIDPattern is the shape Create produces. Reclaim only accepts ids it
// could have issued itself.
var roomIDPattern = regexp.MustCompile(`^room_[a-z0-9]{16}$`)

// Reclaim re-opens a room that the server no longer has.
//
// Rooms are in-memory for the MVP, so a restart or a free-tier idle shutdown
// would otherwise strand a paired couple with ids that resolve to nothing.
// A client that presents both the room id and the Love Code — the two secrets
// that define the space — gets the room back, empty. The drawing is gone; the
// pairing is not, which is the part that matters.
func (h *Hub) Reclaim(id, loveCode string) (*Room, error) {
	if !roomIDPattern.MatchString(id) {
		return nil, ErrNotFound
	}
	code := pairing.NormalizeLoveCode(loveCode)
	if code == "" {
		return nil, ErrNotFound
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	// Someone may have reclaimed it a moment ago.
	if r, ok := h.rooms[id]; ok {
		if r.LoveCode != code {
			return nil, ErrNotFound
		}
		return r, nil
	}
	// The code must not already belong to a different room.
	if r, ok := h.byCode[code]; ok {
		if r.ID != id {
			return nil, ErrNotFound
		}
		return r, nil
	}

	r := newRoom(id, code)
	r.lastActivity = protocol.Activity{
		Kind:      "created",
		Text:      "Welcome back ❤️",
		Timestamp: time.Now().UnixMilli(),
	}
	h.rooms[id] = r
	h.byCode[code] = r
	return r, nil
}

// ByCode resolves a (already normalized) Love Code.
func (h *Hub) ByCode(code string) (*Room, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	r, ok := h.byCode[code]
	if !ok {
		return nil, ErrNotFound
	}
	return r, nil
}

// ByID resolves a room id, which is what reconnecting clients and the widgets use.
func (h *Hub) ByID(id string) (*Room, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	r, ok := h.rooms[id]
	if !ok {
		return nil, ErrNotFound
	}
	return r, nil
}

// Stats reports basic counters for /health.
func (h *Hub) Stats() (rooms, online int) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, r := range h.rooms {
		rooms++
		online += r.Online()
	}
	return rooms, online
}

// StartReaper drops rooms that have been empty for longer than idleTTL.
func (h *Hub) StartReaper(every time.Duration) {
	go func() {
		t := time.NewTicker(every)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				h.reap()
			case <-h.stopped:
				return
			}
		}
	}()
}

// Stop halts the reaper.
func (h *Hub) Stop() { close(h.stopped) }

func (h *Hub) reap() {
	cutoff := time.Now().Add(-idleTTL)
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, r := range h.rooms {
		r.mu.RLock()
		empty := len(r.subs) == 0 && !r.emptySince.IsZero() && r.emptySince.Before(cutoff)
		r.mu.RUnlock()
		if empty {
			delete(h.rooms, id)
			delete(h.byCode, r.LoveCode)
		}
	}
}
