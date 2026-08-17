package websocket_test

import (
	"testing"
	"time"

	"github.com/anivi/server/protocol"
)

// The point of a nudge: one tap asks, the same sticker coming back answers,
// and both people are told at the same moment.
func TestNudgeBecomesAMatchWhenItIsReturned(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)
	b := dial(t, wsURL)
	send(t, b, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_b"})
	expect(t, b, protocol.TypeJoined)

	// A asks for a hug.
	send(t, a, protocol.Envelope{Type: protocol.TypeNudge, Sticker: "hug", Label: "🤗 Hug You"})

	got := expect(t, b, protocol.TypeNudge)
	if got.Sticker != "hug" || got.UserID != "user_a" {
		t.Fatalf("partner received %+v, want a hug from user_a", got)
	}
	if got.Label != "🤗 Hug You" {
		t.Fatalf("label = %q, want the client's own wording", got.Label)
	}
	// Waiting is not yet a hug — the widget should say so without claiming it happened.
	if activity := rm.LastActivity(); activity.Text != "🤗 Hug You" {
		t.Fatalf("pending activity = %q, want the plain label", activity.Text)
	}

	// B hugs back.
	send(t, b, protocol.Envelope{Type: protocol.TypeNudge, Sticker: "hug", Label: "🤗 Hug You"})

	// Both sides — including the one who answered — get the match.
	matchA := expect(t, a, protocol.TypeNudgeMatch)
	matchB := expect(t, b, protocol.TypeNudgeMatch)
	if matchA.Sticker != "hug" || matchB.Sticker != "hug" {
		t.Fatalf("match stickers = %q/%q, want hug on both sides", matchA.Sticker, matchB.Sticker)
	}
	if activity := rm.LastActivity(); activity.Text != "🤗 Hug You 💞" {
		t.Fatalf("matched activity = %q, want the label marked as shared", activity.Text)
	}

	// The pending nudge is consumed: hugging again has to start over.
	if _, waiting := rm.PendingNudge("hug", 3*time.Minute); waiting {
		t.Fatal("a matched nudge must not stay pending")
	}
}

// Tapping your own sticker twice is impatience, not a hug with yourself.
func TestRepeatedNudgeFromSamePersonNeverMatches(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)
	b := dial(t, wsURL)
	send(t, b, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_b"})
	expect(t, b, protocol.TypeJoined)

	send(t, a, protocol.Envelope{Type: protocol.TypeNudge, Sticker: "kiss", Label: "😘 Muththa"})
	expect(t, b, protocol.TypeNudge)

	// Wait out the client-side cooldown, then tap again.
	time.Sleep(800 * time.Millisecond)
	send(t, a, protocol.Envelope{Type: protocol.TypeNudge, Sticker: "kiss", Label: "😘 Muththa"})

	if got := expect(t, b, protocol.TypeNudge); got.Type != protocol.TypeNudge {
		t.Fatalf("second tap produced %q, want another plain nudge", got.Type)
	}
	if user, waiting := rm.PendingNudge("kiss", 3*time.Minute); !waiting || user != "user_a" {
		t.Fatalf("pending = %q/%v, want user_a still waiting", user, waiting)
	}
}

// Different stickers are different invitations: a kiss does not answer a hug.
func TestDifferentStickersDoNotMatchEachOther(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)
	b := dial(t, wsURL)
	send(t, b, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_b"})
	expect(t, b, protocol.TypeJoined)

	send(t, a, protocol.Envelope{Type: protocol.TypeNudge, Sticker: "hug"})
	expect(t, b, protocol.TypeNudge)
	send(t, b, protocol.Envelope{Type: protocol.TypeNudge, Sticker: "kiss"})

	// A hears about the kiss as a fresh invitation, not as a match.
	if got := expect(t, a, protocol.TypeNudge); got.Sticker != "kiss" {
		t.Fatalf("received %+v, want a plain kiss nudge", got)
	}
	if _, waiting := rm.PendingNudge("hug", 3*time.Minute); !waiting {
		t.Fatal("the unanswered hug should still be waiting")
	}
}

func TestNudgeIsRateLimitedAndValidated(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)

	send(t, a, protocol.Envelope{Type: protocol.TypeNudge, Sticker: ""})
	if e := expectAllowError(t, a); e.Code != protocol.ErrBadMessage {
		t.Fatalf("empty sticker error = %q, want %q", e.Code, protocol.ErrBadMessage)
	}

	send(t, a, protocol.Envelope{Type: protocol.TypeNudge, Sticker: "hug"})
	send(t, a, protocol.Envelope{Type: protocol.TypeNudge, Sticker: "hug"})
	if e := expectAllowError(t, a); e.Code != protocol.ErrRateLimited {
		t.Fatalf("mashed nudge error = %q, want %q", e.Code, protocol.ErrRateLimited)
	}
}
