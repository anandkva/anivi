# Anivi API

Everything the server exposes: a small REST API for accounts, connections and
history, and one WebSocket that carries the live session.

- **Base URL** — the Go server (`https://anivi-server.onrender.com` in production, `http://localhost:8080` locally)
- **WebSocket** — `wss://<host>/ws`, configured in the web app as `VITE_WS_URL`
- **Content type** — JSON in and out, except image uploads (multipart) and image reads (PNG/JPEG bytes)

---

## Authentication

There are no passwords. Creating an account returns a `userId`, and that id **is**
the bearer token:

```http
Authorization: Bearer user_2aopwmr71kgqtkjz
```

Two things follow from that:

- The **Anivi Code** (`ANV-8K29P`) is public — you hand it to people so they can
  connect. It is never a credential.
- Signing in on a **new device** needs the code *and* the private **sign-in PIN**,
  because anyone you connected with knows your code.

Being signed in is not enough to reach a room. Every room endpoint also checks
**membership**: the connection record names exactly two user ids, and the caller
has to be one of them. A room id that leaks — a screenshot, an old link — opens
nothing on its own.

| Failure | Status | Code |
| --- | --- | --- |
| No or unknown bearer token | `401` | `unauthorized` |
| Signed in, but not a member of that room | `404` | `room_not_found` |
| Wrong Anivi Code **or** wrong PIN (deliberately the same answer) | `401` | `bad_credentials` |

`404` rather than `403` for non-members is intentional: a `403` would confirm
that the room id exists.

---

## Accounts

### `POST /api/account` — create an account

A name, nothing else.

```json
{ "name": "Anand" }
```

```json
{
  "userId": "user_2aopwmr71kgqtkjz",
  "name": "Anand",
  "aniviCode": "ANV-43R9V",
  "createdAt": 1786979905340,
  "signInPin": "K7M2QP"
}
```

`signInPin` is returned **exactly once**. Only a bcrypt hash of it is stored, so
this response is the only chance to save it. Keep it private; share `aniviCode`
freely.

### `POST /api/signin` — sign in on another device

```json
{ "code": "ANV-43R9V", "pin": "K7M2QP" }
```

Returns the account (no `signInPin`). `401 bad_credentials` for a wrong code or a
wrong PIN; `409 no_pin` for an account created before PINs existed — that one is
fixed from a device already signed in, with `POST /api/account/pin`.

### `GET /api/me` — account + connections

Auth required. This is what the Home screen renders.

```json
{
  "account": { "userId": "user_…", "name": "Anand", "aniviCode": "ANV-43R9V", "createdAt": 1786979905340 },
  "connections": [
    {
      "connectionId": "conn_z2fffqz6gaajw8bs",
      "roomId": "room_w83cy2qyh99spywo",
      "relationship": "friend",
      "peerName": "Vino",
      "peerCode": "ANV-N8W4X",
      "createdAt": 1786979905464,
      "lastActivityAt": 1786980809264,
      "lastActivityBy": "user_gb8q5gxq1ity8o2n"
    }
  ]
}
```

`lastActivityAt` / `lastActivityBy` describe the newest entry in that room —
message or emotion. The client sorts by them (newest first) and shows an unread
badge when `lastActivityAt` is newer than what this device has seen and the
sender was not you. Both are computed in one aggregate for the whole list, not a
query per connection.

### `PATCH /api/account` — rename

Auth required. `{ "name": "Anand K" }` → the updated account.

### `POST /api/account/pin` — issue a new sign-in PIN

Auth required. Returns `{ "signInPin": "M86CQP" }` and invalidates the old one.

---

## Connections

### `POST /api/connections` — connect to someone

Auth required.

```json
{ "code": "ANV-N8W4X", "relationship": "partner" }
```

`relationship` is `partner`, `friend` or `family`. It decides which virtual
actions the space offers, and it is **mirrored** — both people see the same
label.

```json
{
  "connection": { "connectionId": "conn_…", "roomId": "room_…", "relationship": "partner",
                  "peerName": "Vino", "peerCode": "ANV-N8W4X", "createdAt": 1786979905464 },
  "alreadyConnected": false
}
```

Connecting twice is not an error: it returns the existing connection with
`alreadyConnected: true`, and the relationship keeps whatever it was first set
to — so this cannot be used to relabel someone else's connection.

The room appears on **both** home screens immediately; the other person does not
have to enter anything.

| Failure | Status | Code |
| --- | --- | --- |
| Unknown Anivi Code | `404` | `user_not_found` |
| Your own code | `400` | `self_connect` |
| Not `partner`/`friend`/`family` | `400` | `bad_relationship` |

### `DELETE /api/connections/{connectionId}` — disconnect

Auth required, and only for a connection you are in. Closes the space for both
people.

---

## Conversation

### `GET /api/room/{roomId}/messages` — history

Auth + membership required.

| Query | Meaning |
| --- | --- |
| `before` | page backwards from this timestamp (ms) |
| `limit` | page size, default 40, max 100 |
| `kind` | `emotion` for the Emotions tab; omitted for the conversation |

```json
{
  "messages": [
    { "id": "msg_…", "roomId": "room_…", "userId": "user_…", "kind": "text",
      "text": "saaptiya?", "createdAt": 1786980809264 }
  ],
  "hasMore": false
}
```

Returned **oldest first**. Emotions and the conversation live in one collection
but never in one view: `kind=emotion` returns only emotions, and omitting `kind`
returns everything except them.

The web app loads history over HTTP rather than the socket, because the chat is
on screen before the socket finishes opening.

Message kinds: `text`, `image`, `emotion` (and legacy `sticker`).

### `POST /api/room/{roomId}/attachments` — upload a photo

Auth + membership required. `multipart/form-data`, field `file`, one image, max
**10 MB**.

```json
{ "key": "rooms/room_…/1786967080571-ourphoto.png", "mime": "image/png", "size": 70,
  "url": "https://…s3….amazonaws.com/…?X-Amz-Signature=…" }
```

The declared content type is ignored — the bytes are sniffed, and only JPEG,
PNG, WebP and GIF are accepted (`415 unsupported_type` otherwise). The upload
happens first; the client then sends a chat message referencing the `key`, so a
failed upload never leaves a broken bubble.

Only the `key` is stored. Every read mints a fresh 6-hour signed URL, which is
why a photo shared months ago still opens while the bucket stays private.

---

## Widget endpoints

These are **unauthenticated by design** — a Home Screen widget has no way to hold
a token. The room id acts as the capability, and they expose only a snapshot,
never the conversation.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/room/{roomId}` | `{ paired, online, lastActivity, lastActivityKind, lastActivityTimestamp, hasPreview, hasCard, … }` |
| `GET`/`PUT` `/api/room/{roomId}/preview` | the canvas snapshot (PNG) |
| `GET`/`PUT` `/api/room/{roomId}/card` | the composed widget card (PNG) |
| `POST /api/room/{roomId}/miss_you` | send a heart without a socket |

`lastActivity` is a summary — "New message 💬", "New photo 📷" — never the text
of a message. A widget is visible to anyone holding the phone.

---

## Push notifications

Web Push (VAPID). Works for an **installed** PWA: Android after "Install app",
iPhone after "Add to Home Screen" (iOS 16.4+). A plain browser tab cannot
receive push.

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/push/key` | no | `{ "enabled": true, "publicKey": "B…" }` — the VAPID key to subscribe with |
| `POST /api/push/subscribe` | yes | `{ endpoint, p256dh, auth }` from the browser |
| `POST /api/push/unsubscribe` | yes | `{ endpoint }` |

A push is sent only when the recipient is **not connected to that room** —
someone with the app open has already seen it.

The payload never contains message text: it travels through Google/Apple's push
service and lands on a lock screen, which would undo encrypting the conversation
at rest. Emotions are the exception — the label *is* the message, so it reads
"Anand · Sent you 🤗 Hug".

---

## `GET /health`

```json
{ "status": "ok", "rooms": 2, "online": 3,
  "chat": true, "attachments": true, "notifications": true, "time": 1786981279113 }
```

The three booleans say which optional dependencies came up: MongoDB, S3, VAPID
keys. A `false` means that feature is off — the realtime core runs regardless.

---

## WebSocket

```text
wss://<host>/ws?roomId=room_…&userId=user_…
```

The query string joins during the upgrade, so a reconnect costs no extra round
trip. Membership is checked exactly as on REST.

One envelope shape in both directions; irrelevant fields are omitted.

### Client → server

| Type | Fields | Effect |
| --- | --- | --- |
| `join` | `roomId`, `userId` | Joins; server replies `joined` then `state` |
| `draw` | `stroke` | Upserted by `stroke.id`, broadcast to the partner |
| `undo` | optional `strokeId` | Removes your latest stroke; broadcast to **both** |
| `clear` | — | Empties the board for both |
| `sync` | — | Asks for a full `state` replay |
| `chat` | `chat` | Sends a message; stored and broadcast to both |
| `chat_history` | `kind`, `before`, `limit` | A page of history |
| `nudge` | `sticker`, `label` | Sends an emotion (see below) |
| `typing` | `typing` | Tells the partner you are composing |
| `read` | `readAt` | Marks the conversation read up to a timestamp |
| `miss_you` | — | Legacy heart, rate limited to one per 1.5s |
| `ping` / `pong` | `timestamp` | Heartbeat |

### Server → client

| Type | Contains |
| --- | --- |
| `joined` | `roomId`, `userId`, `online`, `paired` |
| `state` | `strokes[]`, `activity`, `online` — the full replay |
| `draw` / `undo` / `clear` | the partner's action |
| `chat` | one message, echoed to the sender too |
| `chat_history` | `messages[]` (oldest first), `kind`, `hasMore` |
| `nudge` | an emotion waiting for an answer |
| `nudge_match` | both of you sent the same one |
| `typing` | `typing` — never sent back to the typist |
| `read` | `readAt` — the partner has read up to here |
| `presence` | `online`, `paired` |
| `error` | `code`, `message` |

Error codes: `bad_message`, `room_not_found`, `not_joined`, `rate_limited`,
`unauthorized`.

### Drawing

Coordinates are **normalized to 0..1**, so a stroke drawn on a phone lands in
the same place on a tablet; `width` is normalized against the smaller edge. The
server clamps both and always overwrites `userId` with the connection's own
identity.

A stroke is **streamed while the finger is down**: the same `stroke.id` is
re-sent every ~80ms with the points so far, and both the server and the partner
upsert rather than accumulate. That is what makes a line appear as it is drawn.
History is capped at 3000 strokes.

### Emotions (`nudge`)

An emotion is an invitation, not a remark:

```text
You tap 🤗 Hug
        ↓  nudge
they see "Anand wants a hug"   ← push if their app is closed
        ↓  they tap the same one within 3 minutes
BOTH get nudge_match, same timestamp → the animation plays together
```

- Only the sticker **id** and the client's own **label** cross the wire. The
  artwork lives in the client, so the sets can be reworded without touching
  stored history.
- Different stickers never match each other; tapping your own twice never
  matches you with yourself.
- Every emotion is **stored** (`kind: "emotion"`), so one you missed is waiting
  in the Emotions tab.
- Rate limited to one per 700ms; the invitation expires after 3 minutes.

### Typing and read receipts

`typing` is **never stored** — a record of when somebody hesitated is not
something Anivi keeps. It is throttled to one frame per 900ms and is not echoed
to the sender.

`read` **is** stored, so "seen" survives a reinstall and agrees across a
person's devices. The mark only ever moves forward.

### Heartbeat

The server sends a protocol-level ping **and** an application-level
`{"type":"ping"}` every 25s, because browsers cannot see or answer protocol
pings. A connection silent for 60s is closed. The web client additionally closes
a socket that has heard nothing for 45s — the "walked out of Wi-Fi range" case,
where the socket still looks open — and reconnects with exponential backoff and
jitter. Reconnecting always replays the room, so a client never has to track
what it missed.

---

## Storage

| Where | What | Why |
| --- | --- | --- |
| Memory | strokes, presence, widget images | worthless once stale |
| MongoDB `users` | name, Anivi Code, PIN **hash** | identity |
| MongoDB `connections` | the two members, room id, relationship | membership is the authorization |
| MongoDB `messages` | conversation **and** emotions, indexed `roomId + createdAt desc` | history is the point |
| MongoDB `read_receipts` | how far each person has read | seen survives a reinstall |
| MongoDB `push_subscriptions` | one row per device | notifications |
| S3 `rooms/<roomId>/…` | photo bytes | images don't belong in a document store |

Message text is encrypted with **AES-256-GCM** before it reaches MongoDB, using
`ANIVI_MESSAGE_KEY`. A stored row looks like:

```text
"text": "enc.v1:weuabnOLG23kw9tNuY9qrau26snvsvd62HFlHXp8CUUm…"
```

Encryption, not hashing — hashing is one way and would make the couple's own
history unreadable too. GCM also authenticates: a row edited in the database
fails to decrypt rather than silently changing what someone said. This protects
a leaked dump, **not** the server, which holds the key. Photos are not covered —
turn on SSE-S3 on the bucket for those.

Both MongoDB and S3 are optional. Without them chat has no history and photos
are refused with a clear message; drawing and emotions still work live.
