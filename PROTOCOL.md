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
| `ping` / `pong` | `timestamp` | Heartbeat |

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

## Rooms

`map[roomID]*Room` behind a `sync.RWMutex`, plus a Love Code index. A room
holds its strokes (capped at 3000), the last activity, and the two widget
images. Rooms are memory-only: empty ones are reclaimed after 48 hours.

If a room is gone but a client still has **both** its room id and Love Code,
`join` re-opens the space empty rather than rejecting the couple — this is what
keeps a pairing alive across a restart or a free-tier sleep. The drawing is
lost; the pairing is not.
