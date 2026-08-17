// Package push delivers notifications to a device whose app is closed.
//
// Anivi uses Web Push (VAPID), which works for an installed PWA on Android and
// on iOS 16.4+ once the app is added to the Home Screen. That matters because
// Anivi has no native app: the same code path covers both phones.
//
// Notifications deliberately carry no message text. The point of encrypting
// the conversation at rest is undone if the content is also sitting in a
// notification payload on a push service's servers and on a lock screen.
package push

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

// ErrGone means the subscription is dead and should be deleted: the browser
// was uninstalled, the user revoked permission, or the endpoint expired.
var ErrGone = errors.New("push: subscription is gone")

// Subscription is what a browser hands over when permission is granted.
type Subscription struct {
	Endpoint string `json:"endpoint" bson:"endpoint"`
	P256dh   string `json:"p256dh" bson:"p256dh"`
	Auth     string `json:"auth" bson:"auth"`
}

// Valid reports whether a subscription has everything needed to send.
func (s Subscription) Valid() bool {
	return s.Endpoint != "" && s.P256dh != "" && s.Auth != ""
}

// Notification is the payload the service worker receives.
type Notification struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	// RoomID lets a tap open the right space.
	RoomID string `json:"roomId,omitempty"`
	Tag    string `json:"tag,omitempty"`
}

// Sender pushes notifications using a VAPID key pair.
type Sender struct {
	publicKey  string
	privateKey string
	subject    string
	ttl        int
}

// Config describes the VAPID identity of this server.
type Config struct {
	PublicKey  string
	PrivateKey string
	// Subject is a mailto: or https: URL push services can use to contact the
	// operator. Required by the VAPID spec.
	Subject string
}

// New builds a sender. It fails rather than silently not notifying anyone.
func New(cfg Config) (*Sender, error) {
	if cfg.PublicKey == "" || cfg.PrivateKey == "" {
		return nil, errors.New("push: VAPID keys are required")
	}
	subject := cfg.Subject
	if subject == "" {
		subject = "mailto:anivi@example.com"
	}
	return &Sender{
		publicKey:  cfg.PublicKey,
		privateKey: cfg.PrivateKey,
		subject:    subject,
		// A heart is only worth delivering for so long; after that it is just
		// a stale buzz.
		ttl: int((6 * time.Hour).Seconds()),
	}, nil
}

// PublicKey is handed to browsers so they can subscribe.
func (s *Sender) PublicKey() string { return s.publicKey }

// Send delivers one notification. A subscription the push service rejects as
// expired comes back as ErrGone so the caller can forget it.
func (s *Sender) Send(ctx context.Context, sub Subscription, n Notification) error {
	if !sub.Valid() {
		return errors.New("push: incomplete subscription")
	}

	payload, err := json.Marshal(n)
	if err != nil {
		return fmt.Errorf("push: encode: %w", err)
	}

	res, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		Subscriber:      s.subject,
		VAPIDPublicKey:  s.publicKey,
		VAPIDPrivateKey: s.privateKey,
		TTL:             s.ttl,
		Urgency:         webpush.UrgencyHigh,
	})
	if err != nil {
		return fmt.Errorf("push: send: %w", err)
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusCreated, http.StatusOK, http.StatusAccepted, http.StatusNoContent:
		return nil
	case http.StatusNotFound, http.StatusGone:
		return ErrGone
	default:
		return fmt.Errorf("push: service returned %s", res.Status)
	}
}

// GenerateKeys returns a fresh VAPID key pair, for setting the server up.
func GenerateKeys() (privateKey, publicKey string, err error) {
	return webpush.GenerateVAPIDKeys()
}
