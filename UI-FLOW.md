# Anivi UI flow

Every screen in the web app, what it calls, and why it behaves the way it does.
Pair it with [API.md](API.md) for the endpoints.

---

## The whole app in one picture

```text
                        ┌──────────────┐
                        │   Onboard    │   no account on this device
                        └──────┬───────┘
              ┌────────────────┴────────────────┐
              │                                 │
      Create Account (name)            I already have a code
              │                                 │
      ANV-8K29P + PIN shown once        code + PIN → sign in
              └────────────────┬────────────────┘
                               │  account saved locally
                        ┌──────▼───────┐
                        │     Home     │  my code · connection cards
                        └──────┬───────┘
                    ┌──────────┴──────────┐
                    │                     │
            + New Connection        tap a connection
                    │                     │
       code → Partner/Friend/Family       │
                    └──────────┬──────────┘
                        ┌──────▼───────┐
                        │    Space     │  one connection's room
                        └──────┬───────┘
                 ┌─────────────┼─────────────┐
             Emotions         Chat         Board
```

Three states, decided in `App.tsx`: no account → **Onboard**, account but
nothing open → **Home**, a connection open → **Space**.

---

## Onboard — `OnboardScreen.tsx`

First launch on any device. Three steps in one component.

**Welcome**

```text
        ❤️  Anivi
    A little space for us

    Your name  [ Anand        ]
    [ Create Account ❤️ ]
              or
    [ I already have an Anivi Code ]
```

No phone number, no email, no password — the friction here is what decides
whether two people actually start.

**Created** — after `POST /api/account`:

```text
    Welcome, Anand ❤️

    MY ANIVI CODE
       ANV-8K29P          ← tap to copy · share freely
    Share this with a partner, friend or family

    ┌──────────────────────────────┐
    │ SIGN-IN PIN — KEEP PRIVATE   │
    │          K7M2QP              │
    │ Shown only now. Never share  │
    └──────────────────────────────┘

    [ I've saved it — continue → ]
```

The PIN is the private half of the identity. The code is public *by design* —
you hand it to everyone you connect with — so it can never be the credential on
its own. If the server is older and returns no PIN, the card is replaced by a
note rather than an empty box; a PIN can be created later from Home.

**Sign in** — `POST /api/signin` with code + PIN, then straight to Home with the
connections already waiting.

---

## Home — `HomeScreen.tsx`

```text
    Hi Anand ❤️                                    ⎋
    Your little space for everyone

    ┌────────────────────────────────────────────┐
    │  MY ANIVI CODE                             │
    │        ANV-8K29P            ← tap to copy  │
    │  🔑 Create a sign-in PIN (for another phone)│
    └────────────────────────────────────────────┘

    Connected                              Refresh
    ┃❤️  Vino          New message 💬     ●        ← unread
    ┃👥  Karthik       👥 Friend          →
    ┃🏠  Mom           🏠 Family          →

    [ + New Connection ]
```

**Ordering.** Newest activity first, counting `max(lastActivityAt, createdAt)` —
so a conversation you just *replied to* rises as well as one you just received.

**Unread badge.** Shown when `lastActivityAt` is newer than this device's stored
mark **and** the last thing was not sent by you. The mark lives in
`localStorage`, not on the server: "seen" belongs to the device in your hand.
Opening the space clears it.

**Staying current.** `GET /api/me` every 15 seconds while Home is visible, plus
immediately on focus or app-resume. Someone can connect to you at any moment and
their card should simply appear — without a socket per account.

The colour of the left edge is the relationship: pink partner, blue friend,
green family.

---

## Connect — `ConnectSheet.tsx`

```text
    Connect someone

    [ Share my code · ANV-8K29P ]     ← share sheet, or copy
                or
    Enter their Anivi Code
    [ ANV-…                    ]

    How are they connected to you?
    ┌────────┐ ┌────────┐ ┌────────┐
    │   ❤️   │ │   👥   │ │   🏠   │
    │Partner │ │ Friend │ │ Family │
    │Hug,Miss│ │Cheers, │ │Take    │
    │Love,Kiss│ │Good Job│ │Care… │
    └────────┘ └────────┘ └────────┘

    [ Connect ❤️ ]
```

The relationship is asked for **up front** because it is not a label — it decides
what the space contains. `POST /api/connections` creates one private room for
both people; connecting to someone twice just opens what exists.

---

## Space — `SpaceScreen.tsx`

One connection's room. The header names the person and the relationship, with
live presence; the bottom nav switches between three views that share one socket.

```text
    ‹  Vino                              Online   ⚙️
       ❤️ Partner
    ──────────────────────────────────────────────
                    ( view )
    ──────────────────────────────────────────────
       💞 Emotions      💬 Chat        🎨 Board
```

### 💞 Emotions — `EmotionsView.tsx`

```text
    ┌──────┐ ┌──────┐ ┌──────┐
    │ 🤗 3 │ │  🥺  │ │  ❤️  │      ← missed count per emotion
    │ Hug  │ │Miss  │ │ Love │
    └──────┘ └──────┘ └──────┘

    FROM VINO WHILE YOU WERE AWAY
    🤗  Hug    Vino · 2 min ago
    🤗  Hug    Vino · 5 min ago
```

The tiles are the relationship's action set (Partner hug/miss/love/kiss/need,
Friend cheers/good job/awesome/lol/thanks, Family thanks/take care/blessings/
help me/home). They stagger in, shine on press, and each shows how many of that
emotion you **missed**.

Below is only what you missed — never a running log, never your own sends. Open
the tab and the mark moves; come back and it reads "Nothing missed ❤️", counts
cleared with it.

Tapping one sends a `nudge`. You see "Sent — waiting for them…"; they get a card
they can answer, and if they send the same one back within three minutes, both
screens play the match animation at the same instant. If their app is closed it
arrives as a push.

### 💬 Chat — `ChatSheet.tsx`

```text
    ┌──────────────────────────┐
    │ vanakkam da ❤️            │  ← theirs
    └──────────────────────────┘
              ┌──────────────────────────┐
              │ saaptiya?      17:08 ✓✓  │  ← mine, seen
              └──────────────────────────┘
    ● ● ●  Vino is typing…

    [ 📷 ]  [ Message…            ]  [ ➤ ]
```

Text and photos. Emotions are **not** here — they have their own tab, so the
compose row is just camera, input, send.

- **History** loads over authenticated HTTP the moment you enter, not over the
  socket: on first render the socket is still opening, and a dropped frame used
  to leave the chat empty forever. The socket then carries live messages.
- **Typing** shows three dots, clears 2.5s after the keys stop, stored nowhere.
- **Seen** is `✓` sent / `✓✓` seen, only on your newest message — a column of
  ticks down the thread is noise.
- **Sending** is optimistic: the bubble appears immediately, dimmed, and is
  replaced when the server echoes it back with its real id.
- **Photos** upload first, then the message references the stored key, so a
  failed upload never leaves a broken bubble.

### 🎨 Board — `Canvas.tsx`

A shared canvas: pen, eraser, undo, clear, three brush sizes, seven colours.
Both people draw at once and the line appears as it is drawn, not when it is
finished. Coordinates are normalized, so both screens agree regardless of size.

If the other person draws while you are in Chat, a ✏️ appears on the Board tab.

### ⚙️ Settings — `SettingsSheet.tsx`

Their code, your code, presence, Home Screen widget setup (room id, card image
URL, widget page URL, link to the iOS script), and removing the connection —
which closes the space for both people, behind a confirmation.

---

## Overlays

| Component | When |
| --- | --- |
| `NudgeOverlay` | asking (their invitation, with a countdown) · waiting (yours, a quiet chip) · **match** (full screen, two emoji meeting, hearts) |
| `MissYouOverlay` | the legacy Miss You heart, received or sent |
| Push prompt | after the first thing you send on that device — never on arrival, when it would just be refused |

---

## What the app keeps on the device

| Key | Holds |
| --- | --- |
| `anivi.account.v2` | userId, Anivi Code, name — the session |
| `anivi.lastConnection.v1` | which space to reopen on launch |
| `anivi.seen.v1` | per-room read mark, for the Home badge |
| `anivi.emotionsSeen.v1` | per-room emotions mark, for the missed list |
| `anivi.push.v1` | whether this device subscribed to notifications |

The **connections list is never cached** — it belongs to the server, so a space
someone opened on another device shows up here too.

---

## Connection handling

The socket is one per open space and survives the network dropping: exponential
backoff with jitter, a 45-second silence watchdog for sockets that look open but
are dead, and a 10-second reconciliation check for the case where a frozen tab
or a pocketed phone comes back with no `close` event ever delivered.

Every reconnect replays the room, so the client never tracks what it missed.
The status pill reads **Connecting… / Online / Together**.
