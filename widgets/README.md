# Anivi on the Home Screen ❤️

## The one thing to know first

**A website or PWA cannot install a Home Screen widget on iOS or Android.**
Neither platform exposes widgets to the browser: on iOS a widget must come
from a native WidgetKit extension inside an installed app, and on Android from
an `AppWidgetProvider` in an installed APK. (The Web App Manifest `widgets`
member exists and Anivi declares it — but only Windows 11's widget board reads
it today.)

So Anivi does the next best thing, and it works today with no app to build:
**the backend publishes the couple's snapshot, and a widget host app on the
phone renders it.**

```text
Anivi (open app)                     Anivi backend                Home Screen
──────────────────                   ─────────────                ───────────
canvas changes / heart arrives  ──▶  stores snapshot         ◀──  widget host
                                     + composed card image        polls, draws,
                                                                  taps → opens Anivi
```

What the server offers each widget surface:

| Endpoint | What it returns |
| --- | --- |
| `GET /api/room/{roomId}` | JSON: `lastActivity`, `lastActivityTimestamp`, `online`, `paired` |
| `GET /api/room/{roomId}/preview` | PNG of the shared drawing only |
| `GET /api/room/{roomId}/card` | PNG of the **whole widget card** — drawing, "❤️ They miss you", time |
| `POST /api/room/{roomId}/miss_you` | Sends a heart (this is how a widget button works) |
| `/widget?room={roomId}` | A small live web page, for hosts that render a URL |

**Everything below is also inside the app**: open Anivi → **⚙️ Settings** →
**❤️ Add the Home Screen widget**. That panel shows your room id, the card
image URL and the widget page URL, each one tap to copy, plus a link to the
iOS script. Doing it from the phone itself is far easier than typing these by
hand.

---

## iPhone — a real WidgetKit widget, no Xcode

Use [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) (free). It
is a native app that hosts real WidgetKit widgets driven by a script, so what
lands on your Home Screen is a genuine iOS widget in the small and medium
sizes.

1. Install **Scriptable** from the App Store.
2. On the iPhone, open <https://anivi-tau.vercel.app/anivi-widget.js> in Safari
   → select all → copy. In Scriptable tap **+**, paste, and name the script
   **Anivi**. (The same file lives here as
   [`ios-scriptable/anivi-widget.js`](ios-scriptable/anivi-widget.js).)
3. Long-press the Home Screen → **+** → **Scriptable** → choose **Small** or **Medium** → **Add Widget**.
4. Long-press the new widget → **Edit Widget**:
   - **Script**: `Anivi`
   - **When Interacting**: `Run Script`
   - **Parameter**: your room id, e.g.

     ```text
     room_xxxxxxxxxxxxxxxx
     ```

     The script already points at
     `https://anivi-server.onrender.com` and `https://anivi-tau.vercel.app`.
     To aim it somewhere else, pass all three: `roomId|apiBase|appUrl`.

Tapping the widget opens Anivi straight into your shared space.

iOS decides when a widget refreshes — expect roughly every 15 minutes, more
often if you look at it a lot. That is an OS rule, not something Anivi can
override; the widget is a snapshot, and the live canvas is in the app.

## iPhone — no extra app at all

Safari → **Share** → **Add to Home Screen** installs Anivi as an app icon. Not
a widget, but one tap into the real thing.

---

## Android

Android has no scripting host as clean as Scriptable, so pick whichever suits
you:

**A. An image widget (simplest).** Install any "image from URL" widget app
from the Play Store, add its widget, and point it at:

```text
https://anivi-server.onrender.com/api/room/room_xxxxxxxxxxxxxxxx/card
```

That URL always returns the current card — drawing, latest activity, time —
already composed by Anivi. Set the refresh interval to 15–30 minutes and the
tap action to open `https://anivi-tau.vercel.app`.

**B. A web-page widget.** If your widget app renders a URL instead of an image,
use the live page — it updates itself every 30 seconds and can send a heart:

```text
https://anivi-tau.vercel.app/widget?room=room_xxxxxxxxxxxxxxxx&user=user_xxxxxxxx&actions=1
```

Drop `&actions=1` if you don't want the **Miss You ❤️** button in the widget.

**C. KWGT**, if you already use it: a Bitmap layer pointing at the `/card` URL
gives the same result inside your existing setup.

**D. Install the PWA.** Chrome → **⋮** → **Install app**. An icon, not a
widget, but it launches in standalone mode.

---

## When a real native widget is worth building

The web-fed widget above is a snapshot on the platform's refresh schedule —
which is all a native widget would be too. A native app would buy you:

- a first-party widget with no host app in between,
- push notifications for Miss You when the app is closed,
- an interactive **Miss You ❤️** button rendered by the OS.

The backend is already shaped for it: a native client would speak the same
WebSocket protocol ([API.md](../API.md)), write the snapshot into an
App Group (iOS) or DataStore (Android), and call `WidgetCenter.reloadTimelines`
/ `updateAppWidget`. Nothing in the realtime core would change.
