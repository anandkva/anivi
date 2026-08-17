# Anivi ❤️

**A little space for us.**

A private realtime space for two people: pair with a Love Code, draw together
on one shared canvas, chat with stickers and photos, and send a
**Miss You ❤️** that lands on your partner's screen instantly. No accounts, no
feed — the pairing lives on your device.

```text
Create Our Space  →  LOVE-7K3P9  →  partner joins  →  ❤️ connected
                                                        ↓
                                            draw together, live
                                                        ↓
                                              Miss You ❤️  →  ❤️
```

## What's here

```text
anivi/
├── server/        Go + WebSocket backend
│   ├── room/      live state: strokes, presence, widget images (memory)
│   ├── store/     durable state: chat history + pairing (MongoDB)
│   └── media/     image attachments (S3, private bucket)
├── web/           React + TypeScript + Vite PWA — the app itself
├── widgets/       Home Screen widget for iOS and Android, fed by the backend
├── PROTOCOL.md    The wire format every client shares
└── DEPLOY.md      Free deployment: Vercel + Render, step by step
```

## Run it locally

Two terminals:

```bash
cd server && go run .
```

```bash
cd web && npm install && npm run dev
```

Open <http://localhost:5173>. To pair a second "partner" on the same machine,
open <http://127.0.0.1:5173> — a different origin gets its own stored pairing.
From a phone on the same Wi-Fi, use your Mac's LAN IP (the dev server already
listens on all interfaces).

Tests:

```bash
cd server && go test ./... -race
```

They cover pairing, stroke history and undo, two partners drawing at once,
Miss You with its cooldown, reconnect state replay, and origin checks.

## How it works

```text
        ┌──────────────────────────────┐
        │  Go server — rooms in memory │
        │  WebSocket + small HTTP API  │
        └───────┬──────────────┬───────┘
     WebSocket  │              │  HTTP snapshot
                │              │
        ┌───────▼──────┐  ┌────▼─────────────┐
        │  Anivi PWA   │  │  Home Screen     │
        │  live canvas │  │  widget (cached) │
        └──────────────┘  └──────────────────┘
```

**The app holds the live connection. The widget shows the last snapshot.**
That split is deliberate: no mobile OS lets a widget keep a socket open, so
pretending otherwise would just produce a widget that lies. Anivi's widget is
a small private window into the space — tap it and the real thing opens.

Details worth knowing:

- **Pairing** is a Love Code (`LOVE-` + 5 characters from an alphabet with no
  look-alikes) stored in `localStorage`. Reopening the app reconnects on its
  own; **Settings → Leave Space** is the only way to clear it.
- **Drawing** streams while your finger is down — the same stroke id is re-sent
  with the points so far, so the partner watches the line appear. Coordinates
  are normalized, so both screens agree.
- **Reconnects** replay the room. Pull the Wi-Fi, put it back, and the canvas
  returns without the client tracking what it missed.
- **Miss You** is rate limited to one heart per 1.5 seconds, plays a chime
  synthesized in the browser (no audio asset), and refreshes the widget card
  immediately — so a heart reaches your partner's Home Screen even if their app
  never opens.

## The Home Screen widget

A website cannot install a widget on iOS or Android — only a native app can.
Anivi works around that instead of faking it: the open app publishes a composed
card image, and a widget host on the phone renders it.

- **iPhone**: a real WidgetKit widget via Scriptable, no Xcode —
  [`widgets/ios-scriptable/anivi-widget.js`](widgets/ios-scriptable/anivi-widget.js)
- **Android**: any image or web-page widget host, pointed at the card URL or
  at `/widget?room=…`

Full instructions, and what a native app would buy you later:
[widgets/README.md](widgets/README.md).

## Deploying

`web/` → Vercel. `server/` → Render (or Fly.io / Koyeb) — anywhere a process
stays alive. Never as a serverless function. The only variable the web app
needs is `VITE_WS_URL`; nothing hardcodes a host.

Step by step, including the free-tier gotchas: [DEPLOY.md](DEPLOY.md).

## Chat

Inside the space, **💬** opens the conversation: text, clipart stickers
(Miss you, Hug you, Kiss, Good night…) and photos. History is saved per room in
MongoDB, so it is there on every device the couple signs into with the same
Love Code — and a "Miss you" sticker triggers the same hearts as the button.

Photos go to S3. The bucket stays private: the server validates that the bytes
really are an image, stores only the object key in the database, and signs a
short-lived link each time a photo is shown. An old photo still opens because
the link is new, not because it was left open.

Both are optional. Without `MONGODB_URI` chat still works live but isn't
saved; without the AWS keys photos are refused with a clear message. Neither
can take drawing or Miss You down with it — see
[`server/.env.example`](server/.env.example).

## Scope

Built: private pairing, live shared canvas, Miss You, chat with stickers and
photos, notification sound, PWA, widget snapshot pipeline, ping/pong heartbeat
with automatic reconnect.

Deliberately not built: logins, voice, video, payments, profiles, public rooms,
analytics. The realtime core stays small so push notifications and native
widgets can be added later without rewriting it.
# anivi
