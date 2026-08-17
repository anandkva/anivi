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
	aniviws "github.com/anivi/server/websocket"
)

// fakeStore stands in for MongoDB so the chat rules can be tested without one.
type fakeStore struct {
	mu       sync.Mutex
	saved    []protocol.ChatMessage
	rooms    map[string]string // roomID -> loveCode
	failNext bool
}

func newFakeStore() *fakeStore { return &fakeStore{rooms: map[string]string{}} }

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

func (f *fakeStore) SaveRoom(_ context.Context, roomID, loveCode string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.rooms[roomID] = loveCode
	return nil
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
	srv := httptest.NewServer(aniviws.Handler(hub, st, fakeMedia{}, func(string) bool { return true }))
	t.Cleanup(srv.Close)
	return hub, "ws" + strings.TrimPrefix(srv.URL, "http")
}

func TestChatReachesPartnerAndIsStored(t *testing.T) {
	fake := newFakeStore()
	hub, wsURL := newChatServer(t, fake)
	rm := hub.Create()

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
	rm := hub.Create()

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
	mine := hub.Create()
	theirs := hub.Create()

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
	rm := hub.Create()

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
	rm := hub.Create()

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

// Without a database the app must still deliver chat live, and say plainly
// that there is no history rather than showing an empty conversation.
func TestChatWorksWithoutAStore(t *testing.T) {
	hub, wsURL := newChatServer(t, nil)
	rm := hub.Create()

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)
	b := dial(t, wsURL)
	send(t, b, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_b"})
	expect(t, b, protocol.TypeJoined)

	send(t, a, protocol.Envelope{
		Type: protocol.TypeChat,
		Chat: &protocol.ChatMessage{Kind: protocol.ChatText, Text: "still works"},
	})
	if got := expect(t, b, protocol.TypeChat); got.Chat.Text != "still works" {
		t.Fatalf("live chat = %q, want it delivered without a database", got.Chat.Text)
	}

	send(t, b, protocol.Envelope{Type: protocol.TypeChatHistory})
	history := expect(t, b, protocol.TypeChatHistory)
	if len(history.Messages) != 0 || history.HasMore {
		t.Fatalf("history = %+v, want an empty page", history)
	}
}

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
