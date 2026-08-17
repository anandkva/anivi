package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

// newTestStore connects to the Mongo named by MONGODB_TEST_URI (falling back to
// a local server) and hands back an isolated database that is dropped at the end
// of the test. Without a reachable Mongo the test skips rather than fails: the
// account model is the one part of Anivi that genuinely needs a database, and a
// machine without one should still be able to run the rest of the suite.
func newTestStore(t *testing.T) *Store {
	t.Helper()

	uri := os.Getenv("MONGODB_TEST_URI")
	if uri == "" {
		uri = os.Getenv("MONGODB_URI")
	}
	if uri == "" {
		uri = "mongodb://localhost:27017"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	dbName := fmt.Sprintf("anivi_test_%d", time.Now().UnixNano())
	s, err := Connect(ctx, uri, dbName)
	if err != nil {
		t.Skipf("mongodb unavailable, skipping account store tests: %v", err)
	}

	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.client.Database(dbName).Drop(cleanupCtx)
		_ = s.Close(cleanupCtx)
	})
	return s
}

func TestCreateUserIssuesADistinctCode(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, _, err := s.CreateUser(ctx, "Anand")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if anand.Name != "Anand" {
		t.Errorf("name = %q, want Anand", anand.Name)
	}
	if anand.AniviCode == "" || anand.UserID == "" {
		t.Fatalf("expected an id and a code, got %+v", anand)
	}

	vino, _, err := s.CreateUser(ctx, "Vino")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if vino.AniviCode == anand.AniviCode {
		t.Error("two accounts were issued the same Anivi Code")
	}

	found, err := s.UserByCode(ctx, anand.AniviCode)
	if err != nil {
		t.Fatalf("UserByCode: %v", err)
	}
	if found.UserID != anand.UserID {
		t.Errorf("UserByCode returned %q, want %q", found.UserID, anand.UserID)
	}
}

func TestCreateUserRequiresAName(t *testing.T) {
	s := newTestStore(t)
	if _, _, err := s.CreateUser(context.Background(), "   "); err == nil {
		t.Fatal("expected a whitespace-only name to be rejected")
	}
}

func TestUserByCodeNotFound(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.UserByCode(context.Background(), "ANV-ZZZZZ"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestConnectionIsMirroredAndVisibleToBothSides(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, _, _ := s.CreateUser(ctx, "Anand")
	mom, _, _ := s.CreateUser(ctx, "Mom")

	conn, err := s.CreateConnection(ctx, anand.UserID, mom.UserID, "family")
	if err != nil {
		t.Fatalf("CreateConnection: %v", err)
	}
	if conn.RoomID == "" {
		t.Fatal("a connection must allocate a room")
	}

	// The person who entered the code sees the peer they connected to...
	mine, err := s.ConnectionsForUser(ctx, anand.UserID)
	if err != nil {
		t.Fatalf("ConnectionsForUser: %v", err)
	}
	if len(mine) != 1 || mine[0].PeerName != "Mom" || mine[0].Relationship != "family" {
		t.Fatalf("anand's home screen = %+v, want one family card for Mom", mine)
	}

	// ...and the other side sees it too, with the same label, without doing
	// anything. That is what "mirrored" means.
	theirs, err := s.ConnectionsForUser(ctx, mom.UserID)
	if err != nil {
		t.Fatalf("ConnectionsForUser: %v", err)
	}
	if len(theirs) != 1 || theirs[0].PeerName != "Anand" || theirs[0].Relationship != "family" {
		t.Fatalf("mom's home screen = %+v, want one family card for Anand", theirs)
	}
	if theirs[0].RoomID != mine[0].RoomID {
		t.Error("both sides must share one room")
	}
}

// A ConnectionView is what leaves the server. It must never carry the peer's
// user id, because that id is the peer's bearer token.
func TestConnectionViewNeverExposesPeerUserID(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, _, _ := s.CreateUser(ctx, "Anand")
	vino, _, _ := s.CreateUser(ctx, "Vino")
	if _, err := s.CreateConnection(ctx, anand.UserID, vino.UserID, "friend"); err != nil {
		t.Fatalf("CreateConnection: %v", err)
	}

	views, err := s.ConnectionsForUser(ctx, anand.UserID)
	if err != nil {
		t.Fatalf("ConnectionsForUser: %v", err)
	}
	for _, v := range views {
		if v.PeerCode != vino.AniviCode {
			t.Errorf("peer code = %q, want the peer's shareable code", v.PeerCode)
		}
		// ConnectionView has no field for a peer user id today. Rendering the
		// whole struct catches the day someone adds one.
		if rendered := fmt.Sprintf("%+v", v); strings.Contains(rendered, vino.UserID) {
			t.Errorf("view leaked the peer's user id: %s", rendered)
		}
	}
}

func TestConnectingTwiceReturnsTheExistingConnection(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, _, _ := s.CreateUser(ctx, "Anand")
	vino, _, _ := s.CreateUser(ctx, "Vino")

	first, err := s.CreateConnection(ctx, anand.UserID, vino.UserID, "partner")
	if err != nil {
		t.Fatalf("CreateConnection: %v", err)
	}

	// The other side entering the code afterwards must land in the same room,
	// not open a second one, and must not silently relabel the relationship.
	again, err := s.CreateConnection(ctx, vino.UserID, anand.UserID, "friend")
	if !errors.Is(err, ErrDuplicateConnection) {
		t.Fatalf("err = %v, want ErrDuplicateConnection", err)
	}
	if again.RoomID != first.RoomID {
		t.Errorf("room = %q, want the existing %q", again.RoomID, first.RoomID)
	}
	if again.Relationship != "partner" {
		t.Errorf("relationship = %q, want the original partner", again.Relationship)
	}
}

func TestCannotConnectToYourself(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, _, _ := s.CreateUser(ctx, "Anand")
	if _, err := s.CreateConnection(ctx, anand.UserID, anand.UserID, "friend"); !errors.Is(err, ErrSelfConnection) {
		t.Fatalf("err = %v, want ErrSelfConnection", err)
	}
}

// One person holds many connections at once — the whole point of the model.
func TestOneUserHoldsManyConnections(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, _, _ := s.CreateUser(ctx, "Anand")
	for _, peer := range []struct{ name, rel string }{
		{"Nivetha", "partner"},
		{"Vino", "friend"},
		{"Mom", "family"},
	} {
		other, _, _ := s.CreateUser(ctx, peer.name)
		if _, err := s.CreateConnection(ctx, anand.UserID, other.UserID, peer.rel); err != nil {
			t.Fatalf("CreateConnection(%s): %v", peer.name, err)
		}
	}

	views, err := s.ConnectionsForUser(ctx, anand.UserID)
	if err != nil {
		t.Fatalf("ConnectionsForUser: %v", err)
	}
	if len(views) != 3 {
		t.Fatalf("got %d connections, want 3", len(views))
	}
	rooms := make(map[string]bool)
	for _, v := range views {
		if rooms[v.RoomID] {
			t.Errorf("two connections share room %q", v.RoomID)
		}
		rooms[v.RoomID] = true
	}
}

func TestDeleteConnectionRemovesItForBothSides(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, _, _ := s.CreateUser(ctx, "Anand")
	stranger, _, _ := s.CreateUser(ctx, "Stranger")
	conn, _ := s.CreateConnection(ctx, anand.UserID, stranger.UserID, "friend")

	if err := s.DeleteConnection(ctx, conn.ConnectionID, anand.UserID); err != nil {
		t.Fatalf("DeleteConnection: %v", err)
	}
	for _, id := range []string{anand.UserID, stranger.UserID} {
		views, err := s.ConnectionsForUser(ctx, id)
		if err != nil {
			t.Fatalf("ConnectionsForUser: %v", err)
		}
		if len(views) != 0 {
			t.Errorf("connection still visible to %q: %+v", id, views)
		}
	}
}

// Deleting is the remedy for a leaked code, so a non-member must not be able to
// do it on someone else's behalf.
func TestDeleteConnectionRejectsNonMembers(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, _, _ := s.CreateUser(ctx, "Anand")
	vino, _, _ := s.CreateUser(ctx, "Vino")
	outsider, _, _ := s.CreateUser(ctx, "Outsider")
	conn, _ := s.CreateConnection(ctx, anand.UserID, vino.UserID, "friend")

	if err := s.DeleteConnection(ctx, conn.ConnectionID, outsider.UserID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound for a non-member", err)
	}
	if views, _ := s.ConnectionsForUser(ctx, anand.UserID); len(views) != 1 {
		t.Error("a non-member's delete removed the connection anyway")
	}
}

func TestNormalizeName(t *testing.T) {
	cases := map[string]string{
		"  Anand  ":     "Anand",
		"Anand   Kumar": "Anand Kumar",
		"":              "",
		"    ":          "",
		"\tNivetha\n":   "Nivetha",
		"aaaaaaaaaabbbbbbbbbbccccccccccddddddddddeeeeeeeeee": "aaaaaaaaaabbbbbbbbbbccccccccccdddddddddd",
	}
	for in, want := range cases {
		if got := NormalizeName(in); got != want {
			t.Errorf("NormalizeName(%q) = %q, want %q", in, got, want)
		}
	}
}

// Signing in on a new device needs the PIN as well as the code. The code is
// public by design — it is handed to everyone you connect with — so on its own
// it must never be enough.
func TestSignInRequiresTheCodeAndThePin(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, pin, err := s.CreateUser(ctx, "Anand")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if pin == "" {
		t.Fatal("account creation must return a sign-in PIN exactly once")
	}

	// The right pair gets in.
	got, err := s.SignIn(ctx, anand.AniviCode, pin)
	if err != nil {
		t.Fatalf("SignIn with the correct PIN: %v", err)
	}
	if got.UserID != anand.UserID {
		t.Fatalf("signed in as %q, want %q", got.UserID, anand.UserID)
	}

	// Someone holding only the shared code does not.
	if _, err := s.SignIn(ctx, anand.AniviCode, "WRONG1"); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("wrong PIN error = %v, want ErrBadCredentials", err)
	}
	if _, err := s.SignIn(ctx, anand.AniviCode, ""); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("empty PIN error = %v, want ErrBadCredentials", err)
	}

	// An unknown code fails the same way, so the endpoint cannot be used to
	// discover which codes exist.
	if _, err := s.SignIn(ctx, "ANV-ZZZZZ", pin); !errors.Is(err, ErrBadCredentials) {
		t.Fatalf("unknown code error = %v, want the same ErrBadCredentials", err)
	}
}

// The PIN itself must not be recoverable from the database.
func TestPinIsStoredOnlyAsAHash(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, pin, err := s.CreateUser(ctx, "Anand")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	stored, err := s.UserByID(ctx, anand.UserID)
	if err != nil {
		t.Fatalf("UserByID: %v", err)
	}
	if len(stored.PinHash) == 0 {
		t.Fatal("no PIN hash was stored")
	}
	if strings.Contains(string(stored.PinHash), pin) {
		t.Fatalf("the stored hash contains the PIN itself: %q", stored.PinHash)
	}
}

// A device that is already signed in can issue a fresh PIN — for an account
// made before sign-in existed, or one whose PIN went astray.
func TestSetPinReplacesTheOldOne(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	anand, firstPin, err := s.CreateUser(ctx, "Anand")
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	secondPin, err := s.SetPin(ctx, anand.UserID)
	if err != nil {
		t.Fatalf("SetPin: %v", err)
	}
	if secondPin == firstPin {
		t.Fatal("a reset must produce a different PIN")
	}
	if _, err := s.SignIn(ctx, anand.AniviCode, secondPin); err != nil {
		t.Fatalf("the new PIN should work: %v", err)
	}
	if _, err := s.SignIn(ctx, anand.AniviCode, firstPin); !errors.Is(err, ErrBadCredentials) {
		t.Fatal("the old PIN must stop working")
	}
	if _, err := s.SetPin(ctx, "user_nobody"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("SetPin for an unknown account = %v, want ErrNotFound", err)
	}
}
