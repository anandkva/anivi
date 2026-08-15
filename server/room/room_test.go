package room

import (
	"strconv"
	"sync"
	"testing"

	"github.com/anivi/server/protocol"
)

type fakeSub struct {
	mu   sync.Mutex
	id   string
	user string
	got  [][]byte
}

func (f *fakeSub) ConnID() string { return f.id }
func (f *fakeSub) UserID() string { return f.user }
func (f *fakeSub) Send(msg []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.got = append(f.got, msg)
}
func (f *fakeSub) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.got)
}

func TestPairingLifecycle(t *testing.T) {
	h := NewHub()
	r := h.Create()

	if got, err := h.ByCode(r.LoveCode); err != nil || got != r {
		t.Fatalf("ByCode(%q) = %v, %v; want the created room", r.LoveCode, got, err)
	}
	if _, err := h.ByCode("LOVE-ZZZZZ"); err == nil {
		t.Fatal("ByCode with an unknown code should fail")
	}

	a := &fakeSub{id: "c1", user: "user_a"}
	b := &fakeSub{id: "c2", user: "user_b"}

	if n := r.Join(a); n != 1 {
		t.Fatalf("first join online = %d, want 1", n)
	}
	if r.Paired() {
		t.Fatal("one device must not count as paired")
	}
	if n := r.Join(b); n != 2 {
		t.Fatalf("second join online = %d, want 2", n)
	}
	if !r.Paired() {
		t.Fatal("two devices should be paired")
	}

	r.Broadcast([]byte("hi"), a.ConnID())
	if a.count() != 0 || b.count() != 1 {
		t.Fatalf("broadcast except sender delivered a=%d b=%d; want 0 and 1", a.count(), b.count())
	}

	// Pairing survives a partner going offline.
	r.Leave(b)
	if !r.Paired() {
		t.Fatal("pairing should outlive a disconnect")
	}
}

func TestStrokeHistory(t *testing.T) {
	h := NewHub()
	r := h.Create()

	r.AddStroke(protocol.Stroke{ID: "s1", UserID: "user_a"})
	r.AddStroke(protocol.Stroke{ID: "s2", UserID: "user_b"})
	r.AddStroke(protocol.Stroke{ID: "s3", UserID: "user_a"})

	// Undo removes only the caller's most recent stroke.
	id, ok := r.Undo("user_a")
	if !ok || id != "s3" {
		t.Fatalf("Undo(user_a) = %q, %v; want s3, true", id, ok)
	}
	if got := len(r.Strokes()); got != 2 {
		t.Fatalf("after undo len(strokes) = %d, want 2", got)
	}
	if _, ok := r.Undo("user_c"); ok {
		t.Fatal("undo for a user with no strokes should report false")
	}

	r.Clear("user_b")
	if got := len(r.Strokes()); got != 0 {
		t.Fatalf("after clear len(strokes) = %d, want 0", got)
	}
	if a := r.LastActivity(); a.Kind != protocol.TypeClear {
		t.Fatalf("last activity kind = %q, want %q", a.Kind, protocol.TypeClear)
	}
}

// A stroke is streamed while the finger is down, so repeated updates carrying
// the same id must replace the stroke instead of stacking copies of it.
func TestStreamedStrokeIsUpserted(t *testing.T) {
	h := NewHub()
	r := h.Create()

	r.AddStroke(protocol.Stroke{ID: "s1", UserID: "user_a", Points: []protocol.Point{{X: 0.1}}})
	r.AddStroke(protocol.Stroke{ID: "s1", UserID: "user_a", Points: []protocol.Point{{X: 0.1}, {X: 0.2}}})

	got := r.Strokes()
	if len(got) != 1 {
		t.Fatalf("len(strokes) = %d, want 1 upserted stroke", len(got))
	}
	if len(got[0].Points) != 2 {
		t.Fatalf("stroke has %d points, want the latest 2", len(got[0].Points))
	}
}

func TestStrokeHistoryIsBounded(t *testing.T) {
	h := NewHub()
	r := h.Create()
	for i := 0; i < maxStrokes+50; i++ {
		r.AddStroke(protocol.Stroke{ID: "s" + strconv.Itoa(i), UserID: "user_a"})
	}
	if got := len(r.Strokes()); got != maxStrokes {
		t.Fatalf("len(strokes) = %d, want the cap %d", got, maxStrokes)
	}
}

func TestPreviewBounds(t *testing.T) {
	h := NewHub()
	r := h.Create()

	if _, ok := r.Preview(); ok {
		t.Fatal("a new room should have no preview")
	}
	if ok := r.SetPreview(nil, "image/png"); ok {
		t.Fatal("an empty preview should be rejected")
	}
	if ok := r.SetPreview(make([]byte, maxPreviewBytes+1), "image/png"); ok {
		t.Fatal("an oversized preview should be rejected")
	}
	if ok := r.SetPreview([]byte{1, 2, 3}, "image/png"); !ok {
		t.Fatal("a small preview should be accepted")
	}
	p, ok := r.Preview()
	if !ok || len(p.Data) != 3 || p.UpdatedAt == 0 {
		t.Fatalf("Preview() = %+v, %v; want the stored snapshot", p, ok)
	}
}

func TestConcurrentRoomAccess(t *testing.T) {
	h := NewHub()
	r := h.Create()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(3)
		go func() { defer wg.Done(); r.AddStroke(protocol.Stroke{ID: "s", UserID: "user_a"}) }()
		go func() { defer wg.Done(); _ = r.Strokes() }()
		go func() { defer wg.Done(); r.Broadcast([]byte("x"), "") }()
	}
	wg.Wait()
}
