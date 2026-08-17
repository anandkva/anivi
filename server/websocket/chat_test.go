package websocket_test

import (
	"context"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/anivi/server/protocol"
	"github.com/anivi/server/room"
	"github.com/anivi/server/store"
	aniviws "github.com/anivi/server/websocket"
)

// fakeStore stands in for MongoDB so the chat and join rules can be tested
// without one. It answers ConnectionByRoom as well as the chat methods, because
// a join is now authorized by connection membership rather than by knowing a
// room id.
type fakeStore struct {
	mu          sync.Mutex
	saved       []protocol.ChatMessage
	connections map[string]store.ConnectionRecord // roomID -> connection
	failNext    bool
}

func newFakeStore() *fakeStore {
	return &fakeStore{connections: map[string]store.ConnectionRecord{}}
}

// connect records the people allowed into roomID.
func (f *fakeStore) connect(roomID string, members ...string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.connections[roomID] = store.ConnectionRecord{
		ConnectionID: "conn_" + roomID,
		RoomID:       roomID,
		Members:      members,
		Relationship: protocol.RelationshipPartner,
	}
}

func (f *fakeStore) ConnectionByRoom(_ context.Context, roomID string) (store.ConnectionRecord, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	rec, ok := f.connections[roomID]
	if !ok {
		return store.ConnectionRecord{}, store.ErrNotFound
	}
	return rec, nil
}

func (f *fakeStore) SaveMessage(_ context.Context, msg protocol.ChatMessage) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.saved = append(f.saved, msg)
	return nil
}

func (f *fakeStore) Messages(_ context.Context, roomID string, before int64, limit int) ([]protocol.ChatMessage, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []protocol.ChatMessage
	for _, m := range f.saved {
		if m.RoomID == roomID && (before == 0 || m.CreatedAt < before) {
			out = append(out, m)
		}
	}
	hasMore := false
	if limit > 0 && len(out) > limit {
		out, hasMore = out[len(out)-limit:], true
	}
	return out, hasMore, nil
}

func (f *fakeStore) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.saved)
}

func (f *fakeStore) last() protocol.ChatMessage {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.saved) == 0 {
		return protocol.ChatMessage{}
	}
	return f.saved[len(f.saved)-1]
}

// fakeMedia mints predictable links so attachment plumbing is testable.
type fakeMedia struct{}

func (fakeMedia) URL(_ context.Context, key string) (string, error) {
	return "https://cdn.example/" + key + "?signed=1", nil
}

func newChatServer(t *testing.T, st aniviws.Persister) (*room.Hub, string) {
	t.Helper()
	hub := room.NewHub()
	srv := httptest.NewServer(aniviws.Handler(hub, st, fakeMedia{}, nil, func(string) bool { return true }))
	t.Cleanup(srv.Close)
	return hub, "ws" + strings.TrimPrefix(srv.URL, "http")
}

func TestChatReachesPartnerAndIsStored(t *testing.T) {
	fake := newFakeStore()
	hub, wsURL := newChatServer(t, fake)
	rm := openRoom(t, hub, fake)

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)
	b := dial(t, wsURL)
	send(t, b, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_b"})
	expect(t, b, protocol.TypeJoined)

	send(t, a, protocol.Envelope{
		Type: protocol.TypeChat,
		Chat: &protocol.ChatMessage{Kind: protocol.ChatText, Text: "  miss you da  "},
	})

	got := expect(t, b, protocol.TypeChat)
	if got.Chat == nil {
		t.Fatal("partner received no chat message")
	}
	if got.Chat.Text != "miss you da" {
		t.Fatalf("text = %q, want the trimmed message", got.Chat.Text)
	}
	if got.Chat.UserID != "user_a" {
		t.Fatalf("author = %q, want user_a (taken from the connection)", got.Chat.UserID)
	}
	if got.Chat.ID == "" || got.Chat.CreatedAt == 0 {
		t.Fatalf("server must assign id and timestamp, got %+v", got.Chat)
	}

	// The sender sees the same message, so both sides agree on id and time.
	echo := expect(t, a, protocol.TypeChat)
	if echo.Chat.ID != got.Chat.ID {
		t.Fatalf("sender echo id = %q, partner id = %q; they must match", echo.Chat.ID, got.Chat.ID)
	}

	waitFor(t, func() bool { return fake.count() == 1 }, "message to be stored")
	if stored := fake.last(); stored.RoomID != rm.ID || stored.Text != "miss you da" {
		t.Fatalf("stored = %+v, want the message filed under the room", stored)
	}

	// The widget line must describe the message without leaking its text.
	if activity := rm.LastActivity(); activity.Text != "New message 💬" {
		t.Fatalf("room activity = %q, want a text-free summary", activity.Text)
	}
}

func TestStickerAndImageMessages(t *testing.T) {
	fake := newFakeStore()
	hub, wsURL := newChatServer(t, fake)
	rm := openRoom(t, hub, fake)

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)

	send(t, a, protocol.Envelope{
		Type: protocol.TypeChat,
		Chat: &protocol.ChatMessage{Kind: protocol.ChatSticker, Sticker: "hug"},
	})
	sticker := expect(t, a, protocol.TypeChat)
	if sticker.Chat.Sticker != "hug" {
		t.Fatalf("sticker = %q, want hug", sticker.Chat.Sticker)
	}

	// An image message carries a key from this room, and comes back with a
	// freshly minted link.
	key := "rooms/" + rm.ID + "/1700000000-photo.jpg"
	send(t, a, protocol.Envelope{
		Type: protocol.TypeChat,
		Chat: &protocol.ChatMessage{
			Kind:       protocol.ChatImage,
			Attachment: &protocol.Attachment{Key: key, Mime: "image/jpeg", Size: 1234},
		},
	})
	img := expect(t, a, protocol.TypeChat)
	if img.Chat.Attachment == nil || img.Chat.Attachment.URL == "" {
		t.Fatalf("image message = %+v, want a signed URL", img.Chat.Attachment)
	}
	if !strings.Contains(img.Chat.Attachment.URL, key) {
		t.Fatalf("URL = %q, want it to point at %q", img.Chat.Attachment.URL, key)
	}

	waitFor(t, func() bool { return fake.count() == 2 }, "both messages to be stored")
	// The signed URL is a rendering detail and must not be persisted.
	for _, m := range fake.saved {
		if m.Attachment != nil && m.Attachment.URL != "" {
			t.Fatalf("stored attachment carries a URL %q; only the key belongs in the database", m.Attachment.URL)
		}
	}
}

// A key from another room would let someone attach a photo they were never
// sent, so the server checks the prefix rather than trusting the client.
func TestImageFromAnotherRoomIsRejected(t *testing.T) {
	fake := newFakeStore()
	hub, wsURL := newChatServer(t, fake)
	mine := openRoom(t, hub, fake)
	theirs := openRoom(t, hub, fake)

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: mine.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)

	send(t, a, protocol.Envelope{
		Type: protocol.TypeChat,
		Chat: &protocol.ChatMessage{
			Kind:       protocol.ChatImage,
			Attachment: &protocol.Attachment{Key: "rooms/" + theirs.ID + "/secret.jpg"},
		},
	})
	if e := expectAllowError(t, a); e.Code != protocol.ErrBadMessage {
		t.Fatalf("error code = %q, want %q", e.Code, protocol.ErrBadMessage)
	}
	if fake.count() != 0 {
		t.Fatal("a rejected message must not be stored")
	}
}

func TestEmptyAndUnknownChatKindsAreRejected(t *testing.T) {
	fake := newFakeStore()
	hub, wsURL := newChatServer(t, fake)
	rm := openRoom(t, hub, fake)

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)

	send(t, a, protocol.Envelope{
		Type: protocol.TypeChat,
		Chat: &protocol.ChatMessage{Kind: protocol.ChatText, Text: "   "},
	})
	if e := expectAllowError(t, a); e.Code != protocol.ErrBadMessage {
		t.Fatalf("blank message error = %q, want %q", e.Code, protocol.ErrBadMessage)
	}

	send(t, a, protocol.Envelope{
		Type: protocol.TypeChat,
		Chat: &protocol.ChatMessage{Kind: "video", Text: "hi"},
	})
	if e := expectAllowError(t, a); e.Code != protocol.ErrBadMessage {
		t.Fatalf("unknown kind error = %q, want %q", e.Code, protocol.ErrBadMessage)
	}
}

func TestChatHistoryIsReplayed(t *testing.T) {
	fake := newFakeStore()
	hub, wsURL := newChatServer(t, fake)
	rm := openRoom(t, hub, fake)

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)

	for _, text := range []string{"first", "second", "third"} {
		send(t, a, protocol.Envelope{
			Type: protocol.TypeChat,
			Chat: &protocol.ChatMessage{Kind: protocol.ChatText, Text: text},
		})
		expect(t, a, protocol.TypeChat)
	}
	waitFor(t, func() bool { return fake.count() == 3 }, "messages to be stored")

	// A new device asks for the conversation and gets it oldest first.
	b := dial(t, wsURL)
	send(t, b, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_b"})
	expect(t, b, protocol.TypeJoined)
	send(t, b, protocol.Envelope{Type: protocol.TypeChatHistory, Limit: 50})

	history := expect(t, b, protocol.TypeChatHistory)
	if len(history.Messages) != 3 {
		t.Fatalf("history has %d messages, want 3", len(history.Messages))
	}
	if history.Messages[0].Text != "first" || history.Messages[2].Text != "third" {
		t.Fatalf("history order = %q…%q, want oldest first",
			history.Messages[0].Text, history.Messages[2].Text)
	}
}

// Chat without a store is no longer a supported mode: membership is what opens
// a room, and membership lives in the store. TestJoinIsRefusedWithoutAStore in
// handler_test.go covers what happens instead.

func waitFor(t *testing.T, cond func() bool, what string) {
	t.Helper()
	for i := 0; i < 100; i++ {
		if cond() {
			return
		}
		sleepBriefly()
	}
	t.Fatalf("timed out waiting for %s", what)
}

func sleepBriefly() { time.Sleep(10 * time.Millisecond) }
