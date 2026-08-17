// Package store is Anivi's durable memory: chat history, and the room records
// that let a couple's space outlive a server restart.
//
// Everything here is optional. If MONGODB_URI is unset the server runs exactly
// as it did before — live drawing and Miss You in memory — and chat simply
// isn't offered. That keeps a database outage from taking the realtime core
// down with it.
package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/anivi/server/protocol"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// ErrNotFound is returned when a room has no record.
var ErrNotFound = errors.New("store: not found")

const (
	roomsCollection    = "rooms"
	messagesCollection = "messages"

	// defaultPageSize is how many messages a history request returns.
	defaultPageSize = 40
	maxPageSize     = 100
)

// Store is a MongoDB-backed persistence layer.
type Store struct {
	client   *mongo.Client
	rooms    *mongo.Collection
	messages *mongo.Collection
}

// RoomRecord is the durable half of a room: enough to rebuild the pairing
// after a restart. Strokes are deliberately not persisted — the canvas is a
// live thing, and replaying an unbounded history would defeat the point.
type RoomRecord struct {
	RoomID    string `bson:"roomId"`
	LoveCode  string `bson:"loveCode"`
	CreatedAt int64  `bson:"createdAt"`
	LastSeen  int64  `bson:"lastSeen"`
}

// Connect dials MongoDB and prepares the indexes.
func Connect(ctx context.Context, uri, database string) (*Store, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(uri).
		SetServerSelectionTimeout(10 * time.Second).
		SetAppName("anivi"))
	if err != nil {
		return nil, fmt.Errorf("store: connect: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("store: ping: %w", err)
	}

	db := client.Database(database)
	s := &Store{
		client:   client,
		rooms:    db.Collection(roomsCollection),
		messages: db.Collection(messagesCollection),
	}
	if err := s.ensureIndexes(ctx); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) ensureIndexes(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	// A room is looked up by id and by Love Code; both must be unique.
	_, err := s.rooms.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "roomId", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "loveCode", Value: 1}}, Options: options.Index().SetUnique(true)},
	})
	if err != nil {
		return fmt.Errorf("store: room indexes: %w", err)
	}

	// History is always read as "the newest N in this room", so the compound
	// index matches the query exactly.
	_, err = s.messages.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "roomId", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "id", Value: 1}}, Options: options.Index().SetUnique(true)},
	})
	if err != nil {
		return fmt.Errorf("store: message indexes: %w", err)
	}
	return nil
}

// Close releases the connection.
func (s *Store) Close(ctx context.Context) error {
	if s == nil || s.client == nil {
		return nil
	}
	return s.client.Disconnect(ctx)
}

// SaveRoom records a room, or refreshes its last-seen time.
func (s *Store) SaveRoom(ctx context.Context, roomID, loveCode string) error {
	now := time.Now().UnixMilli()
	_, err := s.rooms.UpdateOne(ctx,
		bson.M{"roomId": roomID},
		bson.M{
			"$set":         bson.M{"loveCode": loveCode, "lastSeen": now},
			"$setOnInsert": bson.M{"roomId": roomID, "createdAt": now},
		},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil {
		return fmt.Errorf("store: save room: %w", err)
	}
	return nil
}

// RoomByID looks up a room record.
func (s *Store) RoomByID(ctx context.Context, roomID string) (RoomRecord, error) {
	return s.findRoom(ctx, bson.M{"roomId": roomID})
}

// RoomByCode looks up a room by its Love Code.
func (s *Store) RoomByCode(ctx context.Context, loveCode string) (RoomRecord, error) {
	return s.findRoom(ctx, bson.M{"loveCode": loveCode})
}

func (s *Store) findRoom(ctx context.Context, filter bson.M) (RoomRecord, error) {
	var rec RoomRecord
	err := s.rooms.FindOne(ctx, filter).Decode(&rec)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return RoomRecord{}, ErrNotFound
	}
	if err != nil {
		return RoomRecord{}, fmt.Errorf("store: find room: %w", err)
	}
	return rec, nil
}

// SaveMessage appends a chat message to a room's history.
func (s *Store) SaveMessage(ctx context.Context, msg protocol.ChatMessage) error {
	if _, err := s.messages.InsertOne(ctx, msg); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			// A retry after a flaky write: the message is already stored.
			return nil
		}
		return fmt.Errorf("store: save message: %w", err)
	}
	return nil
}

// Messages returns a page of history, oldest first, ending just before the
// `before` timestamp (0 means "the latest"). hasMore reports whether older
// messages exist beyond this page.
func (s *Store) Messages(ctx context.Context, roomID string, before int64, limit int) (msgs []protocol.ChatMessage, hasMore bool, err error) {
	if limit <= 0 || limit > maxPageSize {
		limit = defaultPageSize
	}

	filter := bson.M{"roomId": roomID}
	if before > 0 {
		filter["createdAt"] = bson.M{"$lt": before}
	}

	// Fetch one extra to learn whether an older page exists.
	cursor, err := s.messages.Find(ctx, filter,
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(int64(limit)+1))
	if err != nil {
		return nil, false, fmt.Errorf("store: messages: %w", err)
	}
	defer cursor.Close(ctx)

	var newestFirst []protocol.ChatMessage
	if err := cursor.All(ctx, &newestFirst); err != nil {
		return nil, false, fmt.Errorf("store: decode messages: %w", err)
	}

	if len(newestFirst) > limit {
		hasMore = true
		newestFirst = newestFirst[:limit]
	}

	// Clients render oldest at the top.
	msgs = make([]protocol.ChatMessage, 0, len(newestFirst))
	for i := len(newestFirst) - 1; i >= 0; i-- {
		msgs = append(msgs, newestFirst[i])
	}
	return msgs, hasMore, nil
}

// MessageByID fetches a single message, used when serving an attachment.
func (s *Store) MessageByID(ctx context.Context, id string) (protocol.ChatMessage, error) {
	var msg protocol.ChatMessage
	err := s.messages.FindOne(ctx, bson.M{"id": id}).Decode(&msg)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return protocol.ChatMessage{}, ErrNotFound
	}
	if err != nil {
		return protocol.ChatMessage{}, fmt.Errorf("store: message by id: %w", err)
	}
	return msg, nil
}
