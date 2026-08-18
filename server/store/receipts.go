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

const receiptsCollection = "read_receipts"

// ReadReceipt is how far one person has read in one room.
//
// Kept on the server rather than only on the device so that "seen" survives a
// reinstall and agrees across a person's phones — the same reason the
// conversation itself is not device-local.
type ReadReceipt struct {
	RoomID string `bson:"roomId"`
	UserID string `bson:"userId"`
	ReadAt int64  `bson:"readAt"`
}

func (s *Store) ensureReceiptIndexes(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	_, err := s.receipts.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "roomId", Value: 1}, {Key: "userId", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return fmt.Errorf("store: receipt indexes: %w", err)
	}
	return nil
}

// MarkRead records that userID has read roomID up to readAt.
//
// The mark only ever moves forward: an older device coming back online must
// not un-read a conversation.
func (s *Store) MarkRead(ctx context.Context, roomID, userID string, readAt int64) error {
	if roomID == "" || userID == "" || readAt <= 0 {
		return errors.New("store: incomplete read receipt")
	}
	_, err := s.receipts.UpdateOne(ctx,
		bson.M{"roomId": roomID, "userId": userID, "readAt": bson.M{"$lt": readAt}},
		bson.M{"$set": bson.M{"readAt": readAt}},
		options.UpdateOne().SetUpsert(false),
	)
	if err != nil {
		return fmt.Errorf("store: mark read: %w", err)
	}

	// Upsert separately so a first-ever receipt is created without the
	// forward-only filter rejecting it.
	_, err = s.receipts.UpdateOne(ctx,
		bson.M{"roomId": roomID, "userId": userID},
		bson.M{"$setOnInsert": bson.M{"roomId": roomID, "userId": userID, "readAt": readAt}},
		options.UpdateOne().SetUpsert(true),
	)
	if err != nil && !mongo.IsDuplicateKeyError(err) {
		return fmt.Errorf("store: create read receipt: %w", err)
	}
	return nil
}

// ReadAt reports how far userID has read in roomID.
func (s *Store) ReadAt(ctx context.Context, roomID, userID string) (int64, error) {
	var rec ReadReceipt
	err := s.receipts.FindOne(ctx, bson.M{"roomId": roomID, "userId": userID}).Decode(&rec)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("store: read receipt: %w", err)
	}
	return rec.ReadAt, nil
}

// UnreadCounts reports, for each room, how many entries of a kind arrived from
// someone other than userID since they last read it.
//
// One aggregate for the whole home screen: a badge per connection should not
// cost a query per connection.
func (s *Store) UnreadCounts(ctx context.Context, userID string, roomIDs []string, kind string) (map[string]int, error) {
	counts := make(map[string]int, len(roomIDs))
	if len(roomIDs) == 0 {
		return counts, nil
	}

	cursor, err := s.receipts.Find(ctx, bson.M{"userId": userID, "roomId": bson.M{"$in": roomIDs}})
	if err != nil {
		return nil, fmt.Errorf("store: receipts: %w", err)
	}
	var receipts []ReadReceipt
	if err := cursor.All(ctx, &receipts); err != nil {
		return nil, fmt.Errorf("store: decode receipts: %w", err)
	}
	readAt := make(map[string]int64, len(receipts))
	for _, rec := range receipts {
		readAt[rec.RoomID] = rec.ReadAt
	}

	// One $or branch per room, each with that room's own read mark.
	branches := make([]bson.M, 0, len(roomIDs))
	for _, roomID := range roomIDs {
		branches = append(branches, bson.M{
			"roomId":    roomID,
			"createdAt": bson.M{"$gt": readAt[roomID]},
		})
	}

	match := bson.M{
		"$or":    branches,
		"userId": bson.M{"$ne": userID},
	}
	if kind == protocol.ChatEmotion {
		match["kind"] = protocol.ChatEmotion
	} else {
		match["kind"] = bson.M{"$ne": protocol.ChatEmotion}
	}

	agg, err := s.messages.Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: match}},
		{{Key: "$group", Value: bson.M{"_id": "$roomId", "n": bson.M{"$sum": 1}}}},
	})
	if err != nil {
		return nil, fmt.Errorf("store: unread counts: %w", err)
	}
	defer agg.Close(ctx)

	var rows []struct {
		RoomID string `bson:"_id"`
		N      int    `bson:"n"`
	}
	if err := agg.All(ctx, &rows); err != nil {
		return nil, fmt.Errorf("store: decode unread counts: %w", err)
	}
	for _, row := range rows {
		counts[row.RoomID] = row.N
	}
	return counts, nil
}
