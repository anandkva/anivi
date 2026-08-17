# Anivi protocol

One WebSocket message shape in both directions, mirrored in three places —
keep them in sync:

- `server/protocol/protocol.go`
- `web/src/lib/protocol.ts`
- any future native client

```json
{
  "type": "draw",
  "roomId": "room_123",
  "userId": "user_a",
  "stroke": { "id": "stroke_x", "tool": "pen", "color": "#ff5c8a", "width": 0.008,
              "points": [{ "x": 0.12, "y": 0.24 }, { "x": 0.13, "y": 0.25 }] },
  "timestamp": 1700000000000
}
```

Coordinates are **normalized to 0..1**, so a stroke drawn on a phone lands in
the same place on a tablet. `width` is normalized against the smaller canvas
edge. The server clamps both, and always overwrites `userId` with the
connection's own identity.

## Connecting

```text
wss://<host>/ws?roomId=room_…&userId=user_…&loveCode=LOVE-XXXXX
```

The query string joins the room during the upgrade, so a reconnect costs one
round trip. Sending an explicit `join` afterwards is harmless and equivalent.

## Client → server

| Type | Payload | Effect |
| --- | --- | --- |
| `join` | `roomId` or `loveCode`, optional `userId` | Joins a room; server replies `joined` + `state` |
| `draw` | `stroke` | Upserted by `stroke.id` and broadcast to the partner |
| `undo` | optional `strokeId` | Removes your latest stroke (or the named one); broadcast to **both** |
| `clear` | — | Empties the canvas for both |
| `sync` | — | Asks for a full `state` replay |
| `miss_you` | — | Sends a heart (rate limited to one per 1.5s) |
| `chat` | `chat` | Sends a message; stored and broadcast to both |
| `chat_history` | `before`, `limit` | Asks for a page of past messages |
| `ping` / `pong` | `timestamp` | Heartbeat |

### Chat messages

```json
{
  "type": "chat",
  "chat": { "kind": "sticker", "sticker": "hug" }
}
```

`kind` is `text`, `sticker` or `image`.

- **text** — `text`, trimmed, capped at 2000 characters.
- **sticker** — `sticker` is only a *name*: the artwork lives in the clients
  (`web/src/lib/stickers.ts`), so the set can be restyled without touching
  stored history, and an unknown name degrades to a heart.
- **image** — `attachment.key`, from a prior upload. The key must start with
  `rooms/<this room>/`, so a client cannot attach a photo from another couple's
  space by guessing.

The server always overwrites `id`, `userId`, `roomId` and `createdAt`, and
echoes the message back to the sender as well, so both devices agree on one
id and one timestamp rather than inventing their own.

Attachments come back with a freshly signed `url` on every read; only the
`key` is stored. That is why a photo shared months ago still opens.

A stroke is **streamed while the finger is down**: the same `stroke.id` is
re-sent every ~80ms with the points so far, so both the server and the partner
replace rather than accumulate. That is what makes a line appear as it is
drawn instead of when it is finished.

## Server → client

| Type | Contains |
| --- | --- |
| `joined` | `roomId`, `loveCode`, `userId`, `online`, `paired` |
| `state` | `strokes[]`, `activity`, `online`, `paired` — the full replay |
| `draw` / `undo` / `clear` | The partner's action |
| `miss_you` | `activity` (`"They miss you ❤️"`), `timestamp` |
| `presence` | `online`, `paired` |
| `error` | `code`, `message` |

Error codes: `bad_message`, `room_not_found`, `not_joined`, `rate_limited`.

## Heartbeat

The server sends a protocol-level ping **and** an application-level
`{"type":"ping"}` every 25 seconds, because browsers cannot see or answer
protocol pings. A connection that says nothing for 60 seconds is closed. The
web client additionally closes a socket that has been silent for 45 seconds —
that is the "walked out of Wi-Fi range" case, where the socket still looks
open — and reconnects with exponential backoff and jitter.

Reconnecting always replays the room, so a client never has to track what it
missed.

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness + room/connection counts |
| `POST` | `/api/pair/create` | New space → `roomId`, `loveCode`, `userId` |
| `POST` | `/api/pair/join` | `{ "loveCode": "LOVE-XXXXX" }` → the same room |
| `GET` | `/api/room/{roomId}` | Widget snapshot: latest activity, timestamps, flags |
| `GET`/`PUT` | `/api/room/{roomId}/preview` | The canvas image |
| `GET`/`PUT` | `/api/room/{roomId}/card` | The composed widget card image |
| `POST` | `/api/room/{roomId}/miss_you` | Send a heart without a socket (widgets) |
| `GET` | `/api/room/{roomId}/messages?before=&limit=` | Chat history without a socket |
| `POST` | `/api/room/{roomId}/attachments` | Upload one image (multipart, field `file`) |

## Rooms

`map[roomID]*Room` behind a `sync.RWMutex`, plus a Love Code index. A room
holds its strokes (capped at 3000), the last activity, and the two widget
images. That live state is memory-only: empty rooms are reclaimed after 48
hours.

If a room is gone from memory, `join` re-opens it — from the client's stored
room id + Love Code, or from the `rooms` collection in MongoDB. Either way a
restart or a free-tier sleep never forces a couple to pair again. The canvas
is lost; the pairing and the whole conversation are not.

## Storage

| Where | What | Why |
| --- | --- | --- |
| Memory | strokes, presence, widget images | worthless once stale |
| MongoDB `rooms` | roomId, loveCode, timestamps | pairing survives restarts |
| MongoDB `messages` | every chat message, indexed `roomId + createdAt desc` | history is the point of chat |
| S3 `rooms/<roomId>/…` | attachment bytes | images don't belong in a document store |

Both are optional. Without `MONGODB_URI` chat is live-only; without the AWS
variables photo sharing returns a clear "not set up" error. Neither failure
touches drawing or Miss You.
