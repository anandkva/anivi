package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/anivi/server/push"
	"github.com/anivi/server/store"
)

// notifier fans one notification out to every device a person has registered,
// and forgets the ones their push service says are gone.
//
// It sits here rather than in the push package because it needs the store: the
// push package knows how to send, this knows who to send to.
type notifier struct {
	sender *push.Sender
	store  *store.Store
}

// Notify implements websocket.Notifier.
func (n *notifier) Notify(ctx context.Context, userID string, msg push.Notification) {
	if n == nil || n.sender == nil || n.store == nil || userID == "" {
		return
	}

	subs, err := n.store.SubscriptionsFor(ctx, userID)
	if err != nil {
		log.Printf("anivi: subscriptions for %s: %v", userID, err)
		return
	}
	if len(subs) == 0 {
		log.Printf("anivi: push skipped for %s: no subscriptions", userID)
		return
	}

	for _, sub := range subs {
		err := n.sender.Send(ctx, sub, msg)
		switch {
		case err == nil:
			log.Printf("anivi: push sent to %s via %s", userID, sub.EndpointHost())
		case errors.Is(err, push.ErrGone):
			// The browser is uninstalled or permission was revoked. Drop it so
			// the list does not fill with dead endpoints.
			log.Printf("anivi: push subscription gone for %s via %s", userID, sub.EndpointHost())
			if delErr := n.store.DeleteSubscription(ctx, sub.Endpoint); delErr != nil {
				log.Printf("anivi: drop dead subscription: %v", delErr)
			}
		default:
			log.Printf("anivi: push to %s via %s: %v", userID, sub.EndpointHost(), err)
		}
	}
}

// pushKey hands the browser the VAPID public key it needs to subscribe.
func (a *api) pushKey(w http.ResponseWriter, r *http.Request) {
	if a.push == nil {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false, "publicKey": ""})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":   true,
		"publicKey": a.push.PublicKey(),
	})
}

// subscribePush registers this device for notifications.
func (a *api) subscribePush(w http.ResponseWriter, r *http.Request) {
	user, ok := a.authenticate(w, r)
	if !ok {
		return
	}
	if a.push == nil || a.store == nil {
		writeError(w, http.StatusServiceUnavailable, "push_disabled",
			"notifications aren't set up on this server yet")
		return
	}

	var sub push.Subscription
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&sub); err != nil {
		writeError(w, http.StatusBadRequest, "bad_message", "couldn't read that subscription")
		return
	}
	if !sub.Valid() {
		writeError(w, http.StatusBadRequest, "bad_message", "that subscription is incomplete")
		return
	}

	if err := a.store.SaveSubscription(r.Context(), user.UserID, sub); err != nil {
		log.Printf("anivi: save subscription: %v", err)
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't turn notifications on")
		return
	}
	log.Printf("anivi: push subscription saved for %s via %s", user.UserID, sub.EndpointHost())
	w.WriteHeader(http.StatusNoContent)
}

// unsubscribePush forgets this device.
func (a *api) unsubscribePush(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.authenticate(w, r); !ok {
		return
	}
	if a.store == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&body); err != nil || body.Endpoint == "" {
		writeError(w, http.StatusBadRequest, "bad_message", "which device?")
		return
	}
	if err := a.store.DeleteSubscription(r.Context(), body.Endpoint); err != nil {
		log.Printf("anivi: delete subscription: %v", err)
	}
	log.Printf("anivi: push subscription deleted via %s", push.Subscription{Endpoint: body.Endpoint}.EndpointHost())
	w.WriteHeader(http.StatusNoContent)
}
