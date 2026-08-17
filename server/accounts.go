package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/anivi/server/pairing"
	"github.com/anivi/server/protocol"
	"github.com/anivi/server/store"
)

// The account API.
//
// Anivi has no passwords. Creating an account returns a user id, and that id is
// the bearer token for every later call — sent as `Authorization: Bearer user_…`.
// It is long and random, it is never shown to anybody but its owner, and the
// only thing it can reach is that one person's connections.
//
// The Anivi Code is the opposite: short, memorable, meant to be pasted into a
// message. Holding someone's code lets you connect to them, which is why
// DELETE /api/connections/{id} exists — it is the remedy for a code that ended
// up somewhere it shouldn't have.

// authTimeout bounds every account database call.
const authTimeout = 10 * time.Second

// requireStore reports whether accounts can work at all. Chat and drawing
// degrade gracefully without Mongo; accounts cannot, because a code that
// vanishes on restart is worse than no code.
func (a *api) requireStore(w http.ResponseWriter) bool {
	if a.store == nil {
		writeError(w, http.StatusServiceUnavailable, protocol.ErrAccountsDisabled,
			"accounts need a database — set MONGODB_URI on the server")
		return false
	}
	return true
}

// bearer pulls the user id out of the Authorization header. It also accepts a
// plain value with no scheme, because the widget hosts that call this API are
// not all capable of setting a proper header.
func bearer(r *http.Request) string {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if h == "" {
		return ""
	}
	if after, ok := strings.CutPrefix(h, "Bearer "); ok {
		return strings.TrimSpace(after)
	}
	return h
}

// authenticate resolves the caller, or writes the error and returns false.
func (a *api) authenticate(w http.ResponseWriter, r *http.Request) (store.UserRecord, bool) {
	if !a.requireStore(w) {
		return store.UserRecord{}, false
	}
	id := bearer(r)
	if id == "" {
		writeError(w, http.StatusUnauthorized, protocol.ErrUnauthorized, "sign in on this device first")
		return store.UserRecord{}, false
	}

	ctx, cancel := context.WithTimeout(r.Context(), authTimeout)
	defer cancel()

	user, err := a.store.UserByID(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		// The account was deleted, or this is a stale device. Either way the
		// client should start over rather than retry.
		writeError(w, http.StatusUnauthorized, protocol.ErrUnauthorized, "this account no longer exists")
		return store.UserRecord{}, false
	}
	if err != nil {
		log.Printf("anivi: authenticate: %v", err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't reach your account")
		return store.UserRecord{}, false
	}
	return user, true
}

// accountJSON is the shape the client stores locally. UserID is included
// because this is the one response that goes to the account's own owner.
func accountJSON(user store.UserRecord) map[string]any {
	return map[string]any{
		"userId":    user.UserID,
		"name":      user.Name,
		"aniviCode": user.AniviCode,
		"createdAt": user.CreatedAt,
	}
}

// createAccount is the whole signup: a name in, a code out.
func (a *api) createAccount(w http.ResponseWriter, r *http.Request) {
	if !a.requireStore(w) {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "could not read request")
		return
	}
	if store.NormalizeName(body.Name) == "" {
		writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "what should we call you?")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), authTimeout)
	defer cancel()

	user, pin, err := a.store.CreateUser(ctx, body.Name)
	if err != nil {
		log.Printf("anivi: create account: %v", err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't create your account")
		return
	}

	// The PIN is returned exactly once, here. From now on only its hash
	// exists, so this response is the only chance to save it.
	out := accountJSON(user)
	out["signInPin"] = pin
	writeJSON(w, http.StatusOK, out)
}

// me returns the account and everything on its home screen, which is all the
// client needs to render after a cold start.
func (a *api) me(w http.ResponseWriter, r *http.Request) {
	user, ok := a.authenticate(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), authTimeout)
	defer cancel()

	connections, err := a.store.ConnectionsForUser(ctx, user.UserID)
	if err != nil {
		log.Printf("anivi: connections for %s: %v", user.UserID, err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't load your connections")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"account":     accountJSON(user),
		"connections": connections,
	})
}

// renameAccount changes the display name. The Anivi Code deliberately does not
// change with it: other people already hold that code.
func (a *api) renameAccount(w http.ResponseWriter, r *http.Request) {
	user, ok := a.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "could not read request")
		return
	}
	if store.NormalizeName(body.Name) == "" {
		writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "a name can't be empty")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), authTimeout)
	defer cancel()

	updated, err := a.store.RenameUser(ctx, user.UserID, body.Name)
	if err != nil {
		log.Printf("anivi: rename %s: %v", user.UserID, err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't save your name")
		return
	}
	writeJSON(w, http.StatusOK, accountJSON(updated))
}

// createConnection is "Enter Anivi Code → How are they connected to you?".
//
// There is no approval step: entering a code connects immediately, because the
// code is something its owner chose to hand out. The cost of that choice is
// that a leaked code is actionable, so this pairs with DELETE below.
func (a *api) createConnection(w http.ResponseWriter, r *http.Request) {
	user, ok := a.authenticate(w, r)
	if !ok {
		return
	}
	var body struct {
		Code         string `json:"code"`
		Relationship string `json:"relationship"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "could not read request")
		return
	}

	code := pairing.NormalizeAniviCode(body.Code)
	if code == "" {
		writeError(w, http.StatusBadRequest, protocol.ErrUserNotFound, "an Anivi Code looks like ANV-9K29P")
		return
	}
	if !protocol.ValidRelationship(body.Relationship) {
		writeError(w, http.StatusBadRequest, protocol.ErrBadRelationship, "pick Partner, Friend or Family")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), authTimeout)
	defer cancel()

	peer, err := a.store.UserByCode(ctx, code)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, protocol.ErrUserNotFound, "no one has that Anivi Code")
		return
	}
	if err != nil {
		log.Printf("anivi: user by code: %v", err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't look up that code")
		return
	}

	conn, err := a.store.CreateConnection(ctx, user.UserID, peer.UserID, body.Relationship)
	switch {
	case errors.Is(err, store.ErrSelfConnection):
		writeError(w, http.StatusBadRequest, protocol.ErrSelfConnect, "that's your own code 🙂")
		return
	case errors.Is(err, store.ErrDuplicateConnection):
		// Not a failure: open what already exists. The relationship stays as it
		// was first set, so this cannot be used to relabel someone's connection.
		writeJSON(w, http.StatusOK, map[string]any{
			"connection":       connectionJSON(conn, peer),
			"alreadyConnected": true,
		})
		return
	case err != nil:
		log.Printf("anivi: create connection: %v", err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't create that connection")
		return
	}

	// Open the live room up front so both sides can join it immediately. A
	// failure here is not fatal: the socket adopts the room on join too, and the
	// connection record is what makes the room reachable.
	if _, err := a.hub.Adopt(conn.RoomID); err != nil {
		log.Printf("anivi: adopt room %s: %v", conn.RoomID, err)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"connection":       connectionJSON(conn, peer),
		"alreadyConnected": false,
	})
}

// connectionJSON mirrors store.ConnectionView: the peer by name and code, never
// by user id.
func connectionJSON(conn store.ConnectionRecord, peer store.UserRecord) map[string]any {
	return map[string]any{
		"connectionId": conn.ConnectionID,
		"roomId":       conn.RoomID,
		"relationship": conn.Relationship,
		"peerName":     peer.Name,
		"peerCode":     peer.AniviCode,
		"createdAt":    conn.CreatedAt,
	}
}

// deleteConnection removes a connection for both people, along with its
// conversation. This is what someone reaches for when a code went astray.
func (a *api) deleteConnection(w http.ResponseWriter, r *http.Request) {
	user, ok := a.authenticate(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), authTimeout)
	defer cancel()

	err := a.store.DeleteConnection(ctx, r.PathValue("connectionId"), user.UserID)
	if errors.Is(err, store.ErrNotFound) {
		// Either it never existed or the caller is not a member. Saying which
		// would confirm the existence of someone else's connection.
		writeError(w, http.StatusNotFound, protocol.ErrRoomNotFound, "no such connection")
		return
	}
	if err != nil {
		log.Printf("anivi: delete connection: %v", err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't remove that connection")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// signIn lets an existing account onto a new device.
//
// It takes the Anivi Code *and* the PIN. The code alone cannot be the
// credential: it is meant to be shared with everyone you connect with, so
// accepting it on its own would hand your account to anybody you ever gave it
// to.
func (a *api) signIn(w http.ResponseWriter, r *http.Request) {
	if !a.requireStore(w) {
		return
	}
	var body struct {
		Code string `json:"code"`
		Pin  string `json:"pin"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "could not read request")
		return
	}

	code := pairing.NormalizeAniviCode(body.Code)
	if code == "" {
		writeError(w, http.StatusBadRequest, protocol.ErrUserNotFound, "an Anivi Code looks like ANV-9K29P")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), authTimeout)
	defer cancel()

	user, err := a.store.SignIn(ctx, code, body.Pin)
	switch {
	case errors.Is(err, store.ErrNoPin):
		writeError(w, http.StatusConflict, "no_pin",
			"this account was made before sign-in existed — open Anivi on the device that has it and create a PIN in Settings")
		return
	case err != nil:
		// One message for both causes, so this cannot be used to find out
		// which codes are real.
		writeError(w, http.StatusUnauthorized, "bad_credentials", "that code and PIN don't match")
		return
	}
	writeJSON(w, http.StatusOK, accountJSON(user))
}

// resetPin issues a new PIN, from a device that is already signed in. This is
// how an older account gets one, and how someone replaces a PIN they wrote
// down somewhere they regret.
func (a *api) resetPin(w http.ResponseWriter, r *http.Request) {
	user, ok := a.authenticate(w, r)
	if !ok {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), authTimeout)
	defer cancel()

	pin, err := a.store.SetPin(ctx, user.UserID)
	if err != nil {
		log.Printf("anivi: set pin: %v", err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't create a PIN")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"signInPin": pin})
}
