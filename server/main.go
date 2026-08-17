// Command anivi-server is the realtime backend for Anivi.
//
// The live parts of a room — strokes, presence, Miss You — stay in memory,
// because they are worthless the moment they are stale. Chat history, the
// pairing record and image attachments are durable: MongoDB for documents,
// S3 for the images. Both are optional, and the realtime core keeps working
// without either.
//
// It also exposes a small HTTP API that the Home Screen widgets poll for
// their snapshot.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/anivi/server/media"
	"github.com/anivi/server/protocol"
	"github.com/anivi/server/push"
	"github.com/anivi/server/room"
	"github.com/anivi/server/store"
	aniviws "github.com/anivi/server/websocket"
)

func main() {
	cfg := loadConfig()
	addr := ":" + cfg.Port
	origins := cfg.AllowedOrigins

	hub := room.NewHub()
	hub.StartReaper(1 * time.Hour)
	defer hub.Stop()

	ctx, cancelStartup := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelStartup()

	// Both of these are optional. A failure to reach Mongo or S3 degrades the
	// feature that needs it — it never stops the realtime core from serving.
	var db *store.Store
	if cfg.StorageEnabled() {
		var err error
		db, err = store.Connect(ctx, cfg.MongoURI, cfg.MongoDB)
		if err != nil {
			log.Printf("anivi: mongodb unavailable, chat history disabled: %v", err)
			db = nil
		} else {
			log.Printf("anivi: chat history enabled (database %q)", cfg.MongoDB)

			// Encryption at rest is opt-in by key, but its absence is worth
			// saying out loud: without it the conversation is readable to
			// anyone who can read the database.
			if cfg.MessageKey != "" {
				cipher, cerr := store.NewCipher(cfg.MessageKey)
				if cerr != nil {
					log.Fatalf("anivi: ANIVI_MESSAGE_KEY is unusable: %v", cerr)
				}
				db.UseCipher(cipher)
				log.Println("anivi: message content encrypted at rest")
			} else {
				log.Println("anivi: ANIVI_MESSAGE_KEY not set — messages are stored in plain text")
			}
			defer func() {
				closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				_ = db.Close(closeCtx)
			}()
		}
	} else {
		log.Println("anivi: MONGODB_URI not set, running without chat history")
	}

	var files *media.Store
	if cfg.MediaEnabled() {
		var err error
		files, err = media.New(ctx, media.Config{
			Region:        cfg.AWSRegion,
			Bucket:        cfg.AWSBucket,
			AccessKey:     cfg.AWSAccessKey,
			SecretKey:     cfg.AWSSecretKey,
			PublicBaseURL: cfg.AWSPublicBaseURL,
		})
		if err != nil {
			log.Printf("anivi: s3 unavailable, attachments disabled: %v", err)
			files = nil
		} else {
			log.Printf("anivi: attachments enabled (bucket %q)", cfg.AWSBucket)
		}
	} else {
		log.Println("anivi: AWS credentials not set, running without attachments")
	}

	// Notifications need both a push sender and somewhere to keep the
	// subscriptions, so they ride on the database being up.
	var pusher *push.Sender
	if cfg.PushEnabled() && db != nil {
		var err error
		pusher, err = push.New(push.Config{
			PublicKey:  cfg.VAPIDPublic,
			PrivateKey: cfg.VAPIDPrivate,
			Subject:    cfg.VAPIDSubject,
		})
		if err != nil {
			log.Printf("anivi: push unavailable: %v", err)
			pusher = nil
		} else {
			log.Println("anivi: push notifications enabled")
		}
	} else if !cfg.PushEnabled() {
		log.Println("anivi: ANIVI_VAPID_* not set — no notifications when the app is closed")
	}

	// Typed nils would make the interfaces non-nil, so hand over an interface
	// only when the dependency really exists.
	var persister aniviws.Persister
	if db != nil {
		persister = db
	}
	var linker aniviws.AttachmentLinker
	if files != nil {
		linker = files
	}

	var notify aniviws.Notifier
	if pusher != nil && db != nil {
		notify = &notifier{sender: pusher, store: db}
	}

	api := &api{hub: hub, store: db, media: files, push: pusher}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", api.health)

	// Accounts and connections: a name in, an Anivi Code out, and the
	// relationships that code has been used to build.
	mux.HandleFunc("POST /api/account", api.createAccount)
	mux.HandleFunc("GET /api/me", api.me)
	mux.HandleFunc("POST /api/signin", api.signIn)
	mux.HandleFunc("POST /api/account/pin", api.resetPin)
	mux.HandleFunc("PATCH /api/account", api.renameAccount)
	mux.HandleFunc("POST /api/connections", api.createConnection)
	mux.HandleFunc("DELETE /api/connections/{connectionId}", api.deleteConnection)
	mux.HandleFunc("GET /api/room/{roomId}", api.roomState)
	mux.HandleFunc("GET /api/room/{roomId}/preview", api.getImage(assetPreview))
	mux.HandleFunc("PUT /api/room/{roomId}/preview", api.putImage(assetPreview))
	mux.HandleFunc("GET /api/room/{roomId}/card", api.getImage(assetCard))
	mux.HandleFunc("PUT /api/room/{roomId}/card", api.putImage(assetCard))
	mux.HandleFunc("POST /api/room/{roomId}/miss_you", api.missYou)
	mux.HandleFunc("GET /api/room/{roomId}/messages", api.messages)
	mux.HandleFunc("POST /api/room/{roomId}/attachments", api.uploadAttachment)
	mux.HandleFunc("GET /api/push/key", api.pushKey)
	mux.HandleFunc("POST /api/push/subscribe", api.subscribePush)
	mux.HandleFunc("POST /api/push/unsubscribe", api.unsubscribePush)
	mux.HandleFunc("/ws", aniviws.Handler(hub, persister, linker, notify, originAllowed(origins)))

	srv := &http.Server{
		Addr:    addr,
		Handler: withCORS(origins, mux),
		// No WriteTimeout: it would kill live WebSocket connections.
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		log.Printf("anivi: listening on %s (origins: %s)", addr, strings.Join(origins, ", "))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("anivi: listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("anivi: shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

type api struct {
	hub   *room.Hub
	store *store.Store
	media *media.Store
	push  *push.Sender
}

func (a *api) health(w http.ResponseWriter, r *http.Request) {
	rooms, online := a.hub.Stats()
	writeJSON(w, http.StatusOK, map[string]any{
		"status":        "ok",
		"rooms":         rooms,
		"online":        online,
		"chat":          a.store != nil,
		"attachments":   a.media != nil,
		"notifications": a.push != nil,
		"time":          time.Now().UnixMilli(),
	})
}

// messages serves chat history over HTTP, for clients that want it without a
// socket (a first paint, or the widget page).
func (a *api) messages(w http.ResponseWriter, r *http.Request) {
	rm, err := a.hub.ByID(r.PathValue("roomId"))
	roomID := r.PathValue("roomId")
	if err == nil {
		roomID = rm.ID
	}
	if a.store == nil {
		writeJSON(w, http.StatusOK, map[string]any{"messages": []any{}, "hasMore": false})
		return
	}

	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	msgs, hasMore, err := a.store.Messages(ctx, roomID, before, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage_error", "couldn't load your messages")
		return
	}
	for i := range msgs {
		if msgs[i].Attachment != nil && a.media != nil {
			if url, err := a.media.URL(ctx, msgs[i].Attachment.Key); err == nil {
				msgs[i].Attachment.URL = url
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": msgs, "hasMore": hasMore})
}

// uploadAttachment accepts one image for a room and returns the stored key.
// The client then sends a chat message referring to that key, so a half-
// finished upload never becomes a broken message in the history.
func (a *api) uploadAttachment(w http.ResponseWriter, r *http.Request) {
	roomID := r.PathValue("roomId")
	if _, err := a.hub.ByID(roomID); err != nil {
		writeError(w, http.StatusNotFound, protocol.ErrRoomNotFound, "that space no longer exists")
		return
	}
	if a.media == nil {
		writeError(w, http.StatusServiceUnavailable, "attachments_disabled",
			"photo sharing isn't set up on this server yet")
		return
	}

	// One image per request, bounded before anything is read into memory.
	if err := r.ParseMultipartForm(media.MaxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "couldn't read the image")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "no image in the request")
		return
	}
	defer file.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	key, mime, size, err := a.media.Upload(ctx, roomID, header.Filename, file)
	if err != nil {
		if errors.Is(err, media.ErrUnsupportedType) {
			writeError(w, http.StatusUnsupportedMediaType, "unsupported_type", err.Error())
			return
		}
		log.Printf("anivi: upload for %s: %v", roomID, err)
		writeError(w, http.StatusBadGateway, "upload_failed", "couldn't save that photo")
		return
	}

	url, err := a.media.URL(ctx, key)
	if err != nil {
		log.Printf("anivi: link for %s: %v", key, err)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"key":  key,
		"mime": mime,
		"size": size,
		"url":  url,
	})
}

// roomState is what the Home Screen widgets poll. It is deliberately tiny:
// the latest activity line plus a pointer at the preview image.
func (a *api) roomState(w http.ResponseWriter, r *http.Request) {
	rm, err := a.hub.ByID(r.PathValue("roomId"))
	if err != nil {
		writeError(w, http.StatusNotFound, protocol.ErrRoomNotFound, "that space no longer exists")
		return
	}
	activity := rm.LastActivity()
	preview, hasPreview := rm.Preview()
	card, hasCard := rm.Card()
	writeJSON(w, http.StatusOK, map[string]any{
		"roomId":                rm.ID,
		"paired":                rm.Paired(),
		"online":                rm.Online(),
		"lastActivity":          activity.Text,
		"lastActivityKind":      activity.Kind,
		"lastActivityUserId":    activity.UserID,
		"lastActivityTimestamp": activity.Timestamp,
		"hasPreview":            hasPreview,
		"previewUpdatedAt":      preview.UpdatedAt,
		"hasCard":               hasCard,
		"cardUpdatedAt":         card.UpdatedAt,
	})
}

// The two images a room holds for its widgets: the bare canvas snapshot, and
// the fully composed card (drawing plus the activity line) that image-only
// widget hosts display as-is.
type asset int

const (
	assetPreview asset = iota
	assetCard
)

func (a asset) get(rm *room.Room) (room.Preview, bool) {
	if a == assetCard {
		return rm.Card()
	}
	return rm.Preview()
}

func (a asset) set(rm *room.Room, data []byte, mime string) bool {
	if a == assetCard {
		return rm.SetCard(data, mime)
	}
	return rm.SetPreview(data, mime)
}

func (a *api) getImage(kind asset) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rm, err := a.hub.ByID(r.PathValue("roomId"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		img, ok := kind.get(rm)
		if !ok {
			http.NotFound(w, r)
			return
		}
		etag := `"` + strconv.FormatInt(img.UpdatedAt, 10) + `"`
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Content-Type", img.Mime)
		w.Header().Set("ETag", etag)
		// Widgets should see a fresh snapshot as soon as one exists.
		w.Header().Set("Cache-Control", "no-cache, max-age=0")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(img.Data)
	}
}

// putImage accepts the compact snapshot generated by a main app. Only the
// image is shared — never the stroke history — because that is all a widget
// needs to draw.
func (a *api) putImage(kind asset) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rm, err := a.hub.ByID(r.PathValue("roomId"))
		if err != nil {
			writeError(w, http.StatusNotFound, protocol.ErrRoomNotFound, "that space no longer exists")
			return
		}
		data, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		if err != nil {
			writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "could not read image")
			return
		}
		mime := r.Header.Get("Content-Type")
		if mime != "image/png" && mime != "image/jpeg" && mime != "image/webp" {
			mime = "image/png"
		}
		if !kind.set(rm, data, mime) {
			writeError(w, http.StatusBadRequest, protocol.ErrBadMessage, "image must be 1 byte - 512 KB")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// missYou lets a client send a heart over plain HTTP. Widgets cannot hold a
// WebSocket open, so a widget action routes through here (or, on platforms
// where background network work is unreliable, through the app after launch).
func (a *api) missYou(w http.ResponseWriter, r *http.Request) {
	rm, err := a.hub.ByID(r.PathValue("roomId"))
	if err != nil {
		writeError(w, http.StatusNotFound, protocol.ErrRoomNotFound, "that space no longer exists")
		return
	}
	var body struct {
		UserID string `json:"userId"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)

	activity := protocol.Activity{
		Kind:      protocol.TypeMissYou,
		UserID:    body.UserID,
		Text:      "They miss you ❤️",
		Timestamp: time.Now().UnixMilli(),
	}
	rm.SetActivity(activity)

	msg, err := json.Marshal(protocol.Envelope{
		Type:      protocol.TypeMissYou,
		RoomID:    rm.ID,
		UserID:    body.UserID,
		Activity:  &activity,
		Timestamp: activity.Timestamp,
	})
	if err == nil {
		rm.Broadcast(msg, "")
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "timestamp": activity.Timestamp})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("anivi: write json: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": code, "message": message})
}

func withCORS(origins []string, next http.Handler) http.Handler {
	allowed := originAllowed(origins)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			// Authorization carries the account's bearer id on every account call.
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func originAllowed(origins []string) func(string) bool {
	return func(origin string) bool {
		for _, o := range origins {
			if o == "*" || strings.EqualFold(o, origin) {
				return true
			}
		}
		return false
	}
}
