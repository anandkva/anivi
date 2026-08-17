package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/anivi/server/push"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

const subscriptionsCollection = "push_subscriptions"

// SubscriptionRecord is one device that has agreed to be notified.
//
// A person may have several: a phone, a tablet, a laptop. All of them are
// notified, and each is forgotten independently when its push service says the
// endpoint is gone.
type SubscriptionRecord struct {
	UserID    string            `bson:"userId"`
	Sub       push.Subscription `bson:"sub"`
	CreatedAt int64             `bson:"createdAt"`
	LastUsed  int64             `bson:"lastUsed"`
}

func (s *Store) ensureSubscriptionIndexes(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	_, err := s.subscriptions.Indexes().CreateMany(ctx, []mongo.IndexModel{
		// One row per endpoint: re-subscribing the same device updates it.
		{Keys: bson.D{{Key: "sub.endpoint", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "userId", Value: 1}}},
	})
	if err != nil {
		return fmt.Errorf("store: subscription indexes: %w", err)
	}
	return nil
}

// SaveSubscription records a device for a user, or refreshes an existing one.
func (s *Store) SaveSubscription(ctx context.Context, userID string, sub push.Subscription) error {
	if !sub.Valid() {
		return errors.New("store: incomplete push subscription")
	}
	now := time.Now().UnixMilli()
	_, err := s.subscriptions.UpdateOne(ctx,
		bson.M{"sub.endpoint": sub.Endpoint},
		bson.M{
			"$set":         bson.M{"userId": userID, "sub": sub, "lastUsed": now},
			"$setOnInsert": bson.M{"createdAt": now},
		},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return fmt.Errorf("store: save subscription: %w", err)
	}
	return nil
}

// SubscriptionsFor returns every device a user has registered.
func (s *Store) SubscriptionsFor(ctx context.Context, userID string) ([]push.Subscription, error) {
	cursor, err := s.subscriptions.Find(ctx, bson.M{"userId": userID})
	if err != nil {
		return nil, fmt.Errorf("store: subscriptions: %w", err)
	}
	defer cursor.Close(ctx)

	var records []SubscriptionRecord
	if err := cursor.All(ctx, &records); err != nil {
		return nil, fmt.Errorf("store: decode subscriptions: %w", err)
	}

	subs := make([]push.Subscription, 0, len(records))
	for _, rec := range records {
		subs = append(subs, rec.Sub)
	}
	return subs, nil
}

// DeleteSubscription forgets one device, by endpoint.
func (s *Store) DeleteSubscription(ctx context.Context, endpoint string) error {
	if _, err := s.subscriptions.DeleteOne(ctx, bson.M{"sub.endpoint": endpoint}); err != nil {
		return fmt.Errorf("store: delete subscription: %w", err)
	}
	return nil
}

// PeerOf returns the other member of the connection that owns roomID — the
// person a notification should go to.
func (s *Store) PeerOf(ctx context.Context, roomID, userID string) (string, error) {
	conn, err := s.ConnectionByRoom(ctx, roomID)
	if err != nil {
		return "", err
	}
	for _, member := range conn.Members {
		if member != userID {
			return member, nil
		}
	}
	return "", ErrNotFound
}
