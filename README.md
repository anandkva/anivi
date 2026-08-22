# Anivi ❤️

**A little space for us.**

A private realtime app for the people you actually talk to. Create an account
with just a name, get an **Anivi Code**, and connect it to a partner, a friend
or family — the relationship decides what the space becomes. Chat, send emotions
that only happen when you both send them, and draw together on a shared board.

```text
Create Account (name)  →  ANV-8K29P  →  they enter your code  →  ❤️ Partner
                                                                    ↓
                                                     Emotions · Chat · Board
```

## What's here

```text
anivi/
├── server/        Go + WebSocket backend
│   ├── room/      live state: strokes, presence, widget images (memory)
│   ├── store/     durable state: accounts, connections, history (MongoDB)
│   ├── media/     photo attachments (S3, private bucket)
│   └── push/      Web Push notifications (VAPID)
├── web/           React + TypeScript + Vite PWA — the app itself
├── widgets/       Home Screen widget for iOS and Android
├── API.md         Every endpoint and WebSocket message
├── UI-FLOW.md     Every screen, and why it behaves that way
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

Open <http://localhost:5173>. To try two people on one machine, open the second
at <http://127.0.0.1:5173> — a different origin gets its own stored account.
From a phone on the same Wi-Fi, use your Mac's LAN IP (`ipconfig getifaddr en0`);
the dev server already listens on all interfaces.

What came up:

```bash
curl -s http://localhost:8080/health
```

`chat`, `attachments` and `notifications` report whether MongoDB, S3 and the
VAPID keys are configured — set them in `server/.env` (see
[`server/.env.example`](server/.env.example)). The app runs without any of them,
with those features off.

Tests:

```bash
cd server && go test ./... -race
```

They cover accounts and sign-in, connection membership, chat and emotions,
attachments, message encryption, the nudge match rules, reconnect replay and
origin checks. The store tests skip unless `MONGODB_TEST_URI` points at a
reachable Mongo.

## How it works

```text
        ┌───────────────────────────────┐
        │  Go server                     │
        │  WebSocket + REST              │
        └───┬───────────────┬────────────┘
  WebSocket │               │ HTTP
            │               │
   ┌────────▼──────┐  ┌─────▼──────────┐
   │  Anivi PWA    │  │  Home Screen   │
   │  live session │  │  widget snapshot│
   └───────────────┘  └────────────────┘
```

**The app holds the live connection. The widget shows the last snapshot.** No
mobile OS lets a widget keep a socket open, so pretending otherwise would just
produce a widget that lies.

Worth knowing:

- **Identity** is a name and an Anivi Code. The code is public — you share it to
  connect — so a private **sign-in PIN** is what gets you onto a second phone.
- **Membership is the authorization.** Every room endpoint checks that you are
  one of the connection's two members; a leaked room id opens nothing.
- **Emotions are mutual.** Sending one is an invitation; when the same one comes
  back, both screens play it at the same instant. Missed ones wait in the
  Emotions tab.
- **Messages are encrypted at rest** (AES-256-GCM) — a database dump does not
  read as a transcript. The server holds the key, so this is not end-to-end.
- **Reconnects replay the room**, so a client never tracks what it missed.

Full detail: [API.md](API.md) and [UI-FLOW.md](UI-FLOW.md).

## The Home Screen widget

A website cannot install a widget on iOS or Android — only a native app can.
Anivi works around that instead of faking it: the open app publishes a composed
card image, and a widget host on the phone renders it.

- **iPhone**: a real WidgetKit widget via Scriptable, no Xcode —
  [`widgets/ios-scriptable/anivi-widget.js`](widgets/ios-scriptable/anivi-widget.js)
- **Android**: any image or web-page widget host, pointed at the card URL or at
  `/widget?room=…`

Instructions: [widgets/README.md](widgets/README.md).

## Deploying

`web/` → Vercel. `server/` → Render (or Fly.io / Koyeb) — anywhere a process
stays alive, never a serverless function. Step by step, including the
environment variables and the free-tier gotchas: [DEPLOY.md](DEPLOY.md).

## Scope

Built: accounts and Anivi Codes, relationship-based connections, realtime chat
with photos, mutual emotions with history and counts, typing and seen, a shared
drawing board, push notifications, encryption at rest, a PWA, and Home Screen
widgets fed by the backend.

Deliberately not built: passwords, social profiles, public rooms, feeds,
analytics. The realtime core stays small so what comes next fits without a
rewrite.
