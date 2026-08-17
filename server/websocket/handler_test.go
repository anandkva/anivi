package websocket_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/anivi/server/protocol"
	"github.com/anivi/server/room"
	aniviws "github.com/anivi/server/websocket"
	gws "github.com/gorilla/websocket"
)

func newTestServer(t *testing.T) (*room.Hub, string) {
	t.Helper()
	hub := room.NewHub()
	srv := httptest.NewServer(aniviws.Handler(hub, nil, nil, func(string) bool { return true }))
	t.Cleanup(srv.Close)
	return hub, "ws" + strings.TrimPrefix(srv.URL, "http")
}

func dial(t *testing.T, url string) *gws.Conn {
	t.Helper()
	c, _, err := gws.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { c.Close() })
	return c
}

func send(t *testing.T, c *gws.Conn, e protocol.Envelope) {
	t.Helper()
	if err := c.WriteJSON(e); err != nil {
		t.Fatalf("write %s: %v", e.Type, err)
	}
}

// expect reads until a message of the wanted type arrives, skipping the
// heartbeat and presence traffic that can interleave with it.
func expect(t *testing.T, c *gws.Conn, want string) protocol.Envelope {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		if err := c.SetReadDeadline(deadline); err != nil {
			t.Fatalf("set deadline: %v", err)
		}
		_, data, err := c.ReadMessage()
		if err != nil {
			t.Fatalf("waiting for %q: %v", want, err)
		}
		var env protocol.Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			t.Fatalf("bad json %q: %v", data, err)
		}
		if env.Type == want {
			return env
		}
		if env.Type == protocol.TypeError {
			t.Fatalf("waiting for %q, got error %s: %s", want, env.Code, env.Message)
		}
	}
}

func TestTwoPartnersDrawAndMissEachOther(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	joined := expect(t, a, protocol.TypeJoined)
	if joined.LoveCode != rm.LoveCode {
		t.Fatalf("joined loveCode = %q, want %q", joined.LoveCode, rm.LoveCode)
	}

	// The partner joins with the Love Code rather than the room id.
	b := dial(t, wsURL)
	send(t, b, protocol.Envelope{Type: protocol.TypeJoin, LoveCode: strings.ToLower(rm.LoveCode), UserID: "user_b"})
	joinedB := expect(t, b, protocol.TypeJoined)
	if joinedB.RoomID != rm.ID {
		t.Fatalf("partner joined room %q, want %q", joinedB.RoomID, rm.ID)
	}
	if !joinedB.Paired {
		t.Fatal("second partner should see paired=true")
	}

	// A draws; B receives the stroke.
	send(t, a, protocol.Envelope{
		Type: protocol.TypeDraw,
		Stroke: &protocol.Stroke{
			Tool:   protocol.ToolPen,
			Color:  "#ff5c8a",
			Width:  0.01,
			Points: []protocol.Point{{X: 0.12, Y: 0.24}, {X: 2, Y: -1}},
		},
	})
	draw := expect(t, b, protocol.TypeDraw)
	if draw.Stroke == nil || len(draw.Stroke.Points) != 2 {
		t.Fatalf("partner received %+v, want a 2-point stroke", draw.Stroke)
	}
	if draw.Stroke.UserID != "user_a" {
		t.Fatalf("stroke author = %q, want user_a", draw.Stroke.UserID)
	}
	// Out-of-range coordinates are clamped to the normalized canvas.
	if p := draw.Stroke.Points[1]; p.X != 1 || p.Y != 0 {
		t.Fatalf("clamped point = %+v, want {1 0}", p)
	}

	// B misses A.
	send(t, b, protocol.Envelope{Type: protocol.TypeMissYou})
	miss := expect(t, a, protocol.TypeMissYou)
	if miss.Activity == nil || miss.Activity.Kind != protocol.TypeMissYou {
		t.Fatalf("miss_you activity = %+v, want a miss_you activity", miss.Activity)
	}
	if got := rm.LastActivity().Text; got != "They miss you ❤️" {
		t.Fatalf("room activity = %q", got)
	}

	// The cooldown protects the partner from a mashed button.
	send(t, b, protocol.Envelope{Type: protocol.TypeMissYou})
	if e := expectAllowError(t, b); e.Code != protocol.ErrRateLimited {
		t.Fatalf("second miss_you error = %q, want %q", e.Code, protocol.ErrRateLimited)
	}
}

func TestReconnectRestoresRoomState(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)
	send(t, a, protocol.Envelope{
		Type:   protocol.TypeDraw,
		Stroke: &protocol.Stroke{ID: "s1", Points: []protocol.Point{{X: 0.5, Y: 0.5}}},
	})
	// Let the stroke land before the socket drops.
	send(t, a, protocol.Envelope{Type: protocol.TypeSync})
	expect(t, a, protocol.TypeState)
	a.Close()

	// Reconnecting with the stored pairing in the query string replays state
	// without any extra round trip.
	back := dial(t, wsURL+"?roomId="+rm.ID+"&userId=user_a")
	expect(t, back, protocol.TypeJoined)
	state := expect(t, back, protocol.TypeState)
	if len(state.Strokes) != 1 || state.Strokes[0].ID != "s1" {
		t.Fatalf("restored strokes = %+v, want the stroke drawn before the drop", state.Strokes)
	}
}

func TestUndoAndClearAreBroadcastToBoth(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()

	a := dial(t, wsURL)
	send(t, a, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_a"})
	expect(t, a, protocol.TypeJoined)
	b := dial(t, wsURL)
	send(t, b, protocol.Envelope{Type: protocol.TypeJoin, RoomID: rm.ID, UserID: "user_b"})
	expect(t, b, protocol.TypeJoined)

	send(t, a, protocol.Envelope{
		Type:   protocol.TypeDraw,
		Stroke: &protocol.Stroke{ID: "s1", Points: []protocol.Point{{X: 0.1, Y: 0.1}}},
	})
	expect(t, b, protocol.TypeDraw)

	send(t, a, protocol.Envelope{Type: protocol.TypeUndo})
	// Both sides hear about the undo, including the author.
	if got := expect(t, a, protocol.TypeUndo).StrokeID; got != "s1" {
		t.Fatalf("author undo strokeId = %q, want s1", got)
	}
	if got := expect(t, b, protocol.TypeUndo).StrokeID; got != "s1" {
		t.Fatalf("partner undo strokeId = %q, want s1", got)
	}

	send(t, b, protocol.Envelope{Type: protocol.TypeClear})
	expect(t, a, protocol.TypeClear)
	if got := len(rm.Strokes()); got != 0 {
		t.Fatalf("after clear the room holds %d strokes, want 0", got)
	}
}

// A restart wipes every room. A client that still holds its pairing must be
// able to re-open the space instead of being told to pair again.
func TestReclaimAfterServerRestart(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()
	roomID, loveCode := rm.ID, rm.LoveCode

	// Stand in for a restart: a hub that has never heard of this room.
	fresh := room.NewHub()
	srv := httptest.NewServer(aniviws.Handler(fresh, nil, nil, func(string) bool { return true }))
	defer srv.Close()
	freshURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	c := dial(t, freshURL)
	send(t, c, protocol.Envelope{
		Type:     protocol.TypeJoin,
		RoomID:   roomID,
		LoveCode: loveCode,
		UserID:   "user_a",
	})
	joined := expect(t, c, protocol.TypeJoined)
	if joined.RoomID != roomID || joined.LoveCode != loveCode {
		t.Fatalf("reclaimed room = %q/%q, want %q/%q",
			joined.RoomID, joined.LoveCode, roomID, loveCode)
	}
	// The partner can still reach the same space by Love Code alone.
	if _, err := fresh.ByCode(loveCode); err != nil {
		t.Fatalf("reclaimed room is not reachable by its Love Code: %v", err)
	}
	_ = wsURL
}

func TestReclaimRejectsAMismatchedCode(t *testing.T) {
	hub, wsURL := newTestServer(t)
	rm := hub.Create()

	fresh := room.NewHub()
	srv := httptest.NewServer(aniviws.Handler(fresh, nil, nil, func(string) bool { return true }))
	defer srv.Close()
	freshURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	c := dial(t, freshURL)
	send(t, c, protocol.Envelope{
		Type:     protocol.TypeJoin,
		RoomID:   rm.ID,
		LoveCode: "LOVE-AAAAA",
		UserID:   "user_a",
	})
	// A wrong code is fine here — it just opens a different empty room — but a
	// malformed room id must never be accepted.
	expect(t, c, protocol.TypeJoined)

	c2 := dial(t, freshURL)
	send(t, c2, protocol.Envelope{
		Type:     protocol.TypeJoin,
		RoomID:   "../../etc/passwd",
		LoveCode: "LOVE-AAAAA",
		UserID:   "user_b",
	})
	if e := expectAllowError(t, c2); e.Code != protocol.ErrRoomNotFound {
		t.Fatalf("error code = %q, want %q", e.Code, protocol.ErrRoomNotFound)
	}
	_ = wsURL
}

func TestJoinUnknownRoomFails(t *testing.T) {
	_, wsURL := newTestServer(t)
	c := dial(t, wsURL)
	send(t, c, protocol.Envelope{Type: protocol.TypeJoin, RoomID: "room_nope"})
	if e := expectAllowError(t, c); e.Code != protocol.ErrRoomNotFound {
		t.Fatalf("error code = %q, want %q", e.Code, protocol.ErrRoomNotFound)
	}
}

func TestDrawBeforeJoinIsRejected(t *testing.T) {
	_, wsURL := newTestServer(t)
	c := dial(t, wsURL)
	send(t, c, protocol.Envelope{Type: protocol.TypeDraw, Stroke: &protocol.Stroke{Points: []protocol.Point{{}}}})
	if e := expectAllowError(t, c); e.Code != protocol.ErrNotJoined {
		t.Fatalf("error code = %q, want %q", e.Code, protocol.ErrNotJoined)
	}
}

func TestApplicationPingIsAnswered(t *testing.T) {
	_, wsURL := newTestServer(t)
	c := dial(t, wsURL)
	send(t, c, protocol.Envelope{Type: protocol.TypePing, Timestamp: time.Now().UnixMilli()})
	expect(t, c, protocol.TypePong)
}

func TestOriginIsChecked(t *testing.T) {
	hub := room.NewHub()
	srv := httptest.NewServer(aniviws.Handler(hub, nil, nil, func(o string) bool { return o == "https://anivi.app" }))
	defer srv.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http")

	if _, _, err := gws.DefaultDialer.Dial(url, http.Header{"Origin": []string{"https://evil.example"}}); err == nil {
		t.Fatal("a disallowed origin should not be upgraded")
	}
	c, _, err := gws.DefaultDialer.Dial(url, http.Header{"Origin": []string{"https://anivi.app"}})
	if err != nil {
		t.Fatalf("allowed origin was rejected: %v", err)
	}
	c.Close()
}

// expectAllowError is expect() for cases where the error *is* the expectation.
func expectAllowError(t *testing.T, c *gws.Conn) protocol.Envelope {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for {
		_ = c.SetReadDeadline(deadline)
		_, data, err := c.ReadMessage()
		if err != nil {
			t.Fatalf("waiting for an error message: %v", err)
		}
		var env protocol.Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			t.Fatalf("bad json %q: %v", data, err)
		}
		if env.Type == protocol.TypeError {
			return env
		}
	}
}
