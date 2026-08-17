package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/anivi/server/pairing"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"golang.org/x/crypto/bcrypt"
)

// Sign-in errors. They are deliberately indistinguishable to a caller trying
// to learn which Anivi Codes exist.
var (
	// ErrBadCredentials covers both an unknown code and a wrong PIN.
	ErrBadCredentials = errors.New("store: wrong code or PIN")
	// ErrNoPin means the account predates sign-in and has no PIN yet.
	ErrNoPin = errors.New("store: account has no sign-in PIN")
)

// dummyHash gives a failed lookup the same cost as a real comparison, so
// timing does not reveal whether a code exists.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("anivi-timing-equalizer"), bcrypt.DefaultCost)

const (
	usersCollection       = "users"
	connectionsCollection = "connections"

	// MaxNameLength keeps a display name to something that fits on a card. It
	// is the only field an account has, so it is also the only thing to bound.
	MaxNameLength = 40
)

// ErrDuplicateConnection is returned when two people are already connected.
// Connecting again is not an error the user caused, so callers report it as
// "you're already connected" rather than a failure.
var ErrDuplicateConnection = errors.New("store: already connected")

// ErrSelfConnection is returned when someone enters their own Anivi Code.
var ErrSelfConnection = errors.New("store: cannot connect to yourself")

// UserRecord is one person. Anivi has no passwords: UserID is both the account
// id and the bearer token proving ownership of it, so it never leaves the
// device that created the account. AniviCode is the opposite — it is the handle
// meant to be shared.
type UserRecord struct {
	UserID    string `bson:"userId"`
	Name      string `bson:"name"`
	AniviCode string `bson:"aniviCode"`
	CreatedAt int64  `bson:"createdAt"`
	// PinHash authenticates a sign-in on a new device. The Anivi Code cannot
	// do that job: it is handed out to everyone you connect with, so anyone
	// holding it could otherwise walk into your account. Only the hash is
	// stored, so a database dump does not yield anybody's PIN.
	PinHash []byte `bson:"pinHash,omitempty"`
}

// ConnectionRecord is one relationship between two people, and the room their
// chat and board live in.
//
// Relationship is single and mirrored: both sides see the same label. PairKey
// is the sorted member ids joined, which gives the uniqueness a unique index on
// Members could not — a unique index on an array is multikey, and would stop a
// user from having a second connection at all.
type ConnectionRecord struct {
	ConnectionID string   `bson:"connectionId"`
	RoomID       string   `bson:"roomId"`
	Members      []string `bson:"members"`
	PairKey      string   `bson:"pairKey"`
	Relationship string   `bson:"relationship"`
	CreatedAt    int64    `bson:"createdAt"`
}

// Peer returns the member that is not userID.
func (c ConnectionRecord) Peer(userID string) string {
	for _, m := range c.Members {
		if m != userID {
			return m
		}
	}
	return ""
}

// Has reports whether userID is part of this connection.
func (c ConnectionRecord) Has(userID string) bool {
	for _, m := range c.Members {
		if m == userID {
			return true
		}
	}
	return false
}

// ConnectionView is a connection as its owner sees it: the peer by name, never
// by user id, because a user id is that account's bearer token.
type ConnectionView struct {
	ConnectionID string `json:"connectionId"`
	RoomID       string `json:"roomId"`
	Relationship string `json:"relationship"`
	PeerName     string `json:"peerName"`
	PeerCode     string `json:"peerCode"`
	CreatedAt    int64  `json:"createdAt"`
	// LastActivityAt is when the newest message in this room was sent, and
	// LastActivityBy who sent it. Home compares them with what this device has
	// already seen to decide whether to show a badge — which is why they are
	// on the list rather than requiring a request per connection.
	LastActivityAt int64  `json:"lastActivityAt"`
	LastActivityBy string `json:"lastActivityBy,omitempty"`
}

func (s *Store) ensureAccountIndexes(ctx context.Context) error {
	_, err := s.users.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "userId", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "aniviCode", Value: 1}}, Options: options.Index().SetUnique(true)},
	})
	if err != nil {
		return fmt.Errorf("store: user indexes: %w", err)
	}

	_, err = s.connections.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "connectionId", Value: 1}}, Options: options.Index().SetUnique(true)},
		// One connection per pair, whichever of them entered the code.
		{Keys: bson.D{{Key: "pairKey", Value: 1}}, Options: options.Index().SetUnique(true)},
		// The home screen query: every connection I am a member of.
		{Keys: bson.D{{Key: "members", Value: 1}}},
	})
	if err != nil {
		return fmt.Errorf("store: connection indexes: %w", err)
	}
	return nil
}

// NormalizeName trims a display name and bounds its length. It returns "" when
// nothing usable is left, which callers treat as "a name is required".
func NormalizeName(in string) string {
	name := strings.TrimSpace(in)
	name = strings.Join(strings.Fields(name), " ")
	if len(name) > MaxNameLength {
		name = strings.TrimSpace(name[:MaxNameLength])
	}
	return name
}

// CreateUser registers a person and issues their Anivi Code.
//
// The code is retried on collision rather than pre-checked: the unique index is
// the only thing that can actually decide the race between two signups.
// CreateUser makes an account and returns it together with the one-time PIN
// the person needs to sign in on another device. The PIN is returned exactly
// once: afterwards only its hash exists.
func (s *Store) CreateUser(ctx context.Context, name string) (UserRecord, string, error) {
	name = NormalizeName(name)
	if name == "" {
		return UserRecord{}, "", errors.New("store: name is required")
	}

	pin := pairing.SignInPin()
	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return UserRecord{}, "", fmt.Errorf("store: hash pin: %w", err)
	}

	for attempt := 0; attempt < 8; attempt++ {
		rec := UserRecord{
			UserID:    pairing.UserID(),
			Name:      name,
			AniviCode: pairing.AniviCode(),
			CreatedAt: time.Now().UnixMilli(),
			PinHash:   hash,
		}
		_, err := s.users.InsertOne(ctx, rec)
		if err == nil {
			return rec, pin, nil
		}
		if mongo.IsDuplicateKeyError(err) {
			continue
		}
		return UserRecord{}, "", fmt.Errorf("store: create user: %w", err)
	}
	return UserRecord{}, "", errors.New("store: could not allocate a free Anivi Code")
}

// SignIn authenticates an Anivi Code against its PIN.
//
// The same error comes back for an unknown code and a wrong PIN, so the
// endpoint cannot be used to discover which codes exist.
func (s *Store) SignIn(ctx context.Context, aniviCode, pin string) (UserRecord, error) {
	user, err := s.UserByCode(ctx, aniviCode)
	if err != nil {
		// Spend the time anyway: a fast "no such code" is itself an answer.
		bcrypt.CompareHashAndPassword(dummyHash, []byte(pin))
		return UserRecord{}, ErrBadCredentials
	}
	if len(user.PinHash) == 0 {
		// Created before sign-in existed: there is no PIN to check against.
		return UserRecord{}, ErrNoPin
	}
	if err := bcrypt.CompareHashAndPassword(user.PinHash, []byte(strings.TrimSpace(pin))); err != nil {
		return UserRecord{}, ErrBadCredentials
	}
	return user, nil
}

// SetPin gives an account a PIN, or replaces the one it has. Used to fit out
// accounts made before sign-in existed, from a device that is already in.
func (s *Store) SetPin(ctx context.Context, userID string) (string, error) {
	pin := pairing.SignInPin()
	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("store: hash pin: %w", err)
	}
	res, err := s.users.UpdateOne(ctx, bson.M{"userId": userID}, bson.M{"$set": bson.M{"pinHash": hash}})
	if err != nil {
		return "", fmt.Errorf("store: set pin: %w", err)
	}
	if res.MatchedCount == 0 {
		return "", ErrNotFound
	}
	return pin, nil
}

// UserByID looks up an account by its bearer id.
func (s *Store) UserByID(ctx context.Context, userID string) (UserRecord, error) {
	return s.findUser(ctx, bson.M{"userId": userID})
}

// UserByCode looks up an account by the code its owner shares.
func (s *Store) UserByCode(ctx context.Context, aniviCode string) (UserRecord, error) {
	return s.findUser(ctx, bson.M{"aniviCode": aniviCode})
}

func (s *Store) findUser(ctx context.Context, filter bson.M) (UserRecord, error) {
	var rec UserRecord
	err := s.users.FindOne(ctx, filter).Decode(&rec)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return UserRecord{}, ErrNotFound
	}
	if err != nil {
		return UserRecord{}, fmt.Errorf("store: find user: %w", err)
	}
	return rec, nil
}

// RenameUser changes a display name in place. The Anivi Code never changes with
// it — other people already hold that code, and rotating it would silently
// break every connection they have.
func (s *Store) RenameUser(ctx context.Context, userID, name string) (UserRecord, error) {
	name = NormalizeName(name)
	if name == "" {
		return UserRecord{}, errors.New("store: name is required")
	}
	res, err := s.users.UpdateOne(ctx, bson.M{"userId": userID}, bson.M{"$set": bson.M{"name": name}})
	if err != nil {
		return UserRecord{}, fmt.Errorf("store: rename user: %w", err)
	}
	if res.MatchedCount == 0 {
		return UserRecord{}, ErrNotFound
	}
	return s.UserByID(ctx, userID)
}

// pairKey is the canonical identity of an unordered pair.
func pairKey(a, b string) string {
	ids := []string{a, b}
	sort.Strings(ids)
	return ids[0] + ":" + ids[1]
}

// CreateConnection links two people and allocates the room their chat and board
// share. It is deliberately not an upsert: if the pair is already connected the
// existing connection comes back with ErrDuplicateConnection, so the caller can
// open it instead of quietly relabelling a relationship the other person chose.
func (s *Store) CreateConnection(ctx context.Context, userID, peerID, relationship string) (ConnectionRecord, error) {
	if userID == peerID {
		return ConnectionRecord{}, ErrSelfConnection
	}

	members := []string{userID, peerID}
	sort.Strings(members)

	rec := ConnectionRecord{
		ConnectionID: pairing.ConnectionID(),
		RoomID:       pairing.RoomID(),
		Members:      members,
		PairKey:      pairKey(userID, peerID),
		Relationship: relationship,
		CreatedAt:    time.Now().UnixMilli(),
	}

	if _, err := s.connections.InsertOne(ctx, rec); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			existing, findErr := s.connectionBy(ctx, bson.M{"pairKey": rec.PairKey})
			if findErr != nil {
				return ConnectionRecord{}, findErr
			}
			return existing, ErrDuplicateConnection
		}
		return ConnectionRecord{}, fmt.Errorf("store: create connection: %w", err)
	}
	return rec, nil
}

// ConnectionByID fetches one connection. Membership is the caller's to check.
func (s *Store) ConnectionByID(ctx context.Context, connectionID string) (ConnectionRecord, error) {
	return s.connectionBy(ctx, bson.M{"connectionId": connectionID})
}

// ConnectionByRoom fetches the connection a room belongs to, which is how a
// socket join proves the joiner is allowed into that room.
func (s *Store) ConnectionByRoom(ctx context.Context, roomID string) (ConnectionRecord, error) {
	return s.connectionBy(ctx, bson.M{"roomId": roomID})
}

func (s *Store) connectionBy(ctx context.Context, filter bson.M) (ConnectionRecord, error) {
	var rec ConnectionRecord
	err := s.connections.FindOne(ctx, filter).Decode(&rec)
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ConnectionRecord{}, ErrNotFound
	}
	if err != nil {
		return ConnectionRecord{}, fmt.Errorf("store: find connection: %w", err)
	}
	return rec, nil
}

// ConnectionsForUser returns everything on someone's home screen, newest first,
// with each peer resolved to a name. Peers are fetched in one query rather than
// one per connection.
func (s *Store) ConnectionsForUser(ctx context.Context, userID string) ([]ConnectionView, error) {
	cursor, err := s.connections.Find(ctx,
		bson.M{"members": userID},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}),
	)
	if err != nil {
		return nil, fmt.Errorf("store: connections for user: %w", err)
	}
	defer cursor.Close(ctx)

	var records []ConnectionRecord
	if err := cursor.All(ctx, &records); err != nil {
		return nil, fmt.Errorf("store: decode connections: %w", err)
	}
	if len(records) == 0 {
		return []ConnectionView{}, nil
	}

	peerIDs := make([]string, 0, len(records))
	for _, rec := range records {
		if peer := rec.Peer(userID); peer != "" {
			peerIDs = append(peerIDs, peer)
		}
	}

	peers, err := s.usersByID(ctx, peerIDs)
	if err != nil {
		return nil, err
	}

	roomIDs := make([]string, 0, len(records))
	for _, rec := range records {
		roomIDs = append(roomIDs, rec.RoomID)
	}
	activity, err := s.lastActivityByRoom(ctx, roomIDs)
	if err != nil {
		// A missing badge is not worth failing the whole home screen over.
		activity = map[string]roomActivity{}
	}

	views := make([]ConnectionView, 0, len(records))
	for _, rec := range records {
		peer := peers[rec.Peer(userID)]
		last := activity[rec.RoomID]
		views = append(views, ConnectionView{
			ConnectionID:   rec.ConnectionID,
			RoomID:         rec.RoomID,
			Relationship:   rec.Relationship,
			PeerName:       peer.Name,
			PeerCode:       peer.AniviCode,
			CreatedAt:      rec.CreatedAt,
			LastActivityAt: last.At,
			LastActivityBy: last.By,
		})
	}
	return views, nil
}

func (s *Store) usersByID(ctx context.Context, ids []string) (map[string]UserRecord, error) {
	out := make(map[string]UserRecord, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	cursor, err := s.users.Find(ctx, bson.M{"userId": bson.M{"$in": ids}})
	if err != nil {
		return nil, fmt.Errorf("store: find users: %w", err)
	}
	defer cursor.Close(ctx)

	var records []UserRecord
	if err := cursor.All(ctx, &records); err != nil {
		return nil, fmt.Errorf("store: decode users: %w", err)
	}
	for _, rec := range records {
		out[rec.UserID] = rec
	}
	return out, nil
}

// DeleteConnection removes a connection, and is the answer to a leaked Anivi
// Code. Only a member can delete one, so the membership check is part of the
// filter rather than a separate read.
//
// The conversation is deleted with it: leaving a room's history behind for a
// connection the user just cut would be a surprise, not a feature.
func (s *Store) DeleteConnection(ctx context.Context, connectionID, userID string) error {
	rec, err := s.connectionBy(ctx, bson.M{"connectionId": connectionID, "members": userID})
	if err != nil {
		return err
	}
	if _, err := s.connections.DeleteOne(ctx, bson.M{"connectionId": connectionID}); err != nil {
		return fmt.Errorf("store: delete connection: %w", err)
	}
	if _, err := s.messages.DeleteMany(ctx, bson.M{"roomId": rec.RoomID}); err != nil {
		return fmt.Errorf("store: delete connection messages: %w", err)
	}
	return nil
}

// roomActivity is the newest message in a room: when, and from whom.
type roomActivity struct {
	At int64
	By string
}

// lastActivityByRoom finds the newest message in each of several rooms in one
// round trip, so a home screen with many connections is still a single query.
func (s *Store) lastActivityByRoom(ctx context.Context, roomIDs []string) (map[string]roomActivity, error) {
	out := make(map[string]roomActivity, len(roomIDs))
	if len(roomIDs) == 0 {
		return out, nil
	}

	cursor, err := s.messages.Aggregate(ctx, mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"roomId": bson.M{"$in": roomIDs}}}},
		{{Key: "$sort", Value: bson.D{{Key: "createdAt", Value: -1}}}},
		{{Key: "$group", Value: bson.M{
			"_id":       "$roomId",
			"createdAt": bson.M{"$first": "$createdAt"},
			"userId":    bson.M{"$first": "$userId"},
		}}},
	})
	if err != nil {
		return nil, fmt.Errorf("store: last activity: %w", err)
	}
	defer cursor.Close(ctx)

	var rows []struct {
		RoomID    string `bson:"_id"`
		CreatedAt int64  `bson:"createdAt"`
		UserID    string `bson:"userId"`
	}
	if err := cursor.All(ctx, &rows); err != nil {
		return nil, fmt.Errorf("store: decode last activity: %w", err)
	}
	for _, row := range rows {
		out[row.RoomID] = roomActivity{At: row.CreatedAt, By: row.UserID}
	}
	return out, nil
}
