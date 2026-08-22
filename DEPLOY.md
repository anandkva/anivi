# Deploying Anivi (free)

## Your deployment

| | |
| --- | --- |
| Web app | <https://anivi-tau.vercel.app> |
| Server | <https://anivi-server.onrender.com> |
| WebSocket | `wss://anivi-server.onrender.com/ws` |

The WebSocket URL is committed in [`web/.env.production`](web/.env.production),
so every Vercel build picks it up — there is nothing to configure in the Vercel
dashboard. **After changing that file you must redeploy**, because Vite bakes
the value into the bundle at build time.

Two things still worth doing on your setup:

1. **Tighten the server's origins.** Render → `anivi-server` → Environment →
   set `ANIVI_ALLOWED_ORIGINS` to `https://anivi-tau.vercel.app`. Right now any
   website can open a socket to your server.
2. **Keep it awake** (optional). The free instance sleeps after ~15 minutes;
   see the caveat below.

### Chat and photos: environment variables

Add these in Render → `anivi-server` → **Environment**. Both groups are
optional and independent — the app runs without either.

| Variable | Enables | Example |
| --- | --- | --- |
| `MONGODB_URI` | **accounts, connections, history** — without it nobody can sign in | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/anivi?retryWrites=true&w=majority` |
| `MONGODB_DATABASE` | database name (default `anivi`) | `anivi` |
| `ANIVI_MESSAGE_KEY` | encrypts message text at rest | `openssl rand -base64 32` |
| `ANIVI_VAPID_PUBLIC_KEY` | push notifications | `go run ./cmd/vapid` prints a pair |
| `ANIVI_VAPID_PRIVATE_KEY` | " | " |
| `ANIVI_VAPID_SUBJECT` | " | `mailto:you@example.com` |
| `AWS_REGION` | photo attachments | `ap-south-1` |
| `AWS_BUCKET_NAME` | " | `your-bucket` |
| `AWS_ACCESS_KEY_ID` | " | from an IAM user |
| `AWS_SECRET_ACCESS_KEY` | " | from an IAM user |

> **Keep `ANIVI_MESSAGE_KEY` safe and never change it in place.** It is the only
> thing that can read messages already stored; losing it makes them permanently
> unreadable, by design. Use a different key in production than in development.

`MONGODB_URI` is no longer optional in practice: accounts and connection
membership live there, so without it the app stops at the Create Account screen.

`GET /health` tells you what came up:

```bash
curl -s https://anivi-server.onrender.com/health
```

```json
{ "status": "ok", "chat": true, "attachments": true, "notifications": true, ... }
```

`chat: false` means Mongo didn't connect, `attachments: false` means the AWS
variables are missing or wrong, and `notifications: false` means the VAPID keys
are absent. The server logs the reason for each at startup.

**MongoDB Atlas — allow Render to connect.** Atlas blocks unknown IPs by
default, and a free Render instance has no fixed egress IP. Atlas → **Network
Access** → **Add IP Address** → `0.0.0.0/0`. That is safe only because the
connection still needs the database password — so give that user a strong one
and limit it to the `anivi` database.

**S3 bucket setup.** Keep **Block all public access ON**: Anivi never makes an
object public, it signs a 6-hour read link each time a photo is displayed. The
IAM user needs nothing more than this:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject"],
    "Resource": "arn:aws:s3:::YOUR_BUCKET/rooms/*"
  }]
}
```

Add a lifecycle rule if you want old photos to expire on their own.

The rest of this document is the full walkthrough, useful if you redeploy
somewhere else.

---

Two pieces go to two different places:

| Piece | Goes to | Why |
| --- | --- | --- |
| `web/` — the React PWA | **Vercel** (free Hobby) | static files on a CDN |
| `server/` — the Go WebSocket server | **Render** free web service (or Fly.io / Koyeb) | needs a process that stays alive and holds sockets open |

> Do **not** deploy the Go server as a Vercel serverless function. Serverless
> functions are killed between requests, and a WebSocket has to stay connected.

Deploy the **server first** — the web app needs its URL.

---

## 1. Put the code on GitHub

```bash
cd /Users/anandkumar/Development/anivi
git init
git add .
git commit -m "Anivi ❤️"
```

Create an empty repository on GitHub, then:

```bash
git remote add origin https://github.com/<you>/anivi.git
git branch -M main
git push -u origin main
```

---

## 2. Deploy the Go server on Render (free)

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Web Service →** pick your `anivi` repository.
3. Fill in:
   - **Root Directory**: `server`
   - **Runtime**: `Docker` (it will find `server/Dockerfile`)
   - **Instance Type**: `Free`
   - **Region**: whichever is closest to both of you
   - **Health Check Path**: `/health`
4. **Environment variables** → add:
   - `PORT` = `8080`
   - `ANIVI_ALLOWED_ORIGINS` = `*` for now (you will tighten this in step 4)
5. **Create Web Service** and wait for the first build (~2 minutes).

You get a URL like `https://anivi-server.onrender.com`. Check it:

```bash
curl https://anivi-server.onrender.com/health
```

Expected: `{"status":"ok","rooms":0,"online":0,"time":...}`

Your WebSocket URL is that host with `wss://` and `/ws`:

```text
wss://anivi-server.onrender.com/ws
```

> The repository also has a `render.yaml` blueprint if you prefer
> **New → Blueprint** instead of clicking through the form.

### Free-tier caveat you should know about

A free Render service **sleeps after ~15 minutes with no traffic**, and rooms
live in memory. Two consequences:

- The first connection after a sleep takes 30–60 seconds to wake the server.
  Anivi reconnects on its own, so it looks like a slow "Connecting…".
- Waking up starts an empty process, but nothing is lost: accounts,
  connections and history live in MongoDB, and the live room is re-opened from
  the connection record the moment a member joins. **Only the drawing on the
  board — which is memory-only by design — does not survive.**

To avoid sleeping altogether, ping `/health` every 10 minutes from a free
uptime monitor (UptimeRobot, Better Stack, or a GitHub Action on a cron). If
you want the canvas itself to survive restarts, that is where persistence
would be added — `room.Room` is the only place that holds state.

### Alternatives to Render

| Host | Notes |
| --- | --- |
| **Fly.io** | No sleeping on the smallest machines; needs `flyctl` and a card on file. `fly launch --dockerfile server/Dockerfile` |
| **Koyeb** | Free instance, WebSockets supported, similar flow to Render |
| **Railway** | Easiest UX, but the free tier is trial credit rather than an always-free instance |

All of them read the same `PORT` and `ANIVI_ALLOWED_ORIGINS` variables.

---

## 3. Deploy the web app on Vercel (free)

1. Sign in at [vercel.com](https://vercel.com) with GitHub → **Add New → Project** → import `anivi`.
2. Set **Root Directory** to `web`. Vercel detects Vite and reads `web/vercel.json`.
3. Point the app at your server by editing [`web/.env.production`](web/.env.production):

   ```text
   VITE_WS_URL=wss://anivi-server.onrender.com/ws
   ```

   It must be `wss://` — a page served over HTTPS cannot open a plain `ws://`
   socket. The REST base is derived automatically (`wss://host/ws` →
   `https://host`), so there is nothing else to set unless your API lives on a
   different host (`VITE_API_URL`).

   Prefer the dashboard instead? Add `VITE_WS_URL` under **Settings →
   Environment Variables** — it overrides the file.
4. **Deploy**. You get `https://anivi-tau.vercel.app`.

> Vite bakes `VITE_*` values in at build time. Changing the URL — in the file
> or in the dashboard — does nothing until you **redeploy**.
>
> Quick check that a deploy picked it up:
>
> ```bash
> curl -s https://anivi-tau.vercel.app/assets/$(curl -s https://anivi-tau.vercel.app/ | grep -o 'storage-[^"]*\.js' | head -1) | grep -o 'wss://[^"]*'
> ```
>
> It should print your `wss://…/ws`. If it prints nothing, the build had no
> `VITE_WS_URL` and the app will sit on "Connecting…" forever.

---

## 4. Lock the server to your web origin

Back in Render → your service → **Environment**, replace `ANIVI_ALLOWED_ORIGINS`:

```text
https://anivi-tau.vercel.app
```

Comma-separate if you add a custom domain later:

```text
https://anivi-tau.vercel.app,https://anivi.app
```

Save (the service redeploys). Browsers from any other origin are now refused;
native clients, which send no `Origin` header, still connect.

---

## 5. Check it end to end

On two phones, or two browsers with different profiles:

1. Open the Vercel URL on phone A → **Create Account ❤️** → note the Anivi Code
   and save the sign-in PIN.
2. Open it on phone B → create an account there too → **+ New Connection** →
   enter A's Anivi Code → pick **Partner / Friend / Family** → **Connect ❤️**.
   The space appears on *both* home screens; B does not have to be entered on
   A's phone as well.
3. Open the connection on both → **Board** → draw on A. It appears on B within
   a moment, and the reverse.
4. **Emotions** on A → tap 🤗. B gets it (or a push, if their app is closed).
   B taps the same one back → both screens play the match together.
5. **Chat** → type on A. B sees the typing dots, then the message, and A's tick
   turns to ✓✓ once B is looking.
6. Turn Wi-Fi off on B for ten seconds, then on. B reconnects on its own and
   the board comes back — that is the state replay after `join`.

Your Anivi Code is on the Home screen — tap it to copy, or use **Share my code**
in the connect sheet to send it through any app.

---

## 6. Install it on the Home Screen

**Android (Chrome):** open the site → menu **⋮** → **Install app**.

**iPhone (Safari):** open the site → **Share** → **Add to Home Screen**.

That installs the app. For the Home Screen **widget**, see
[widgets/README.md](widgets/README.md) — iOS and Android do not let a website
register a widget, so the widget is fed by the same backend through a widget
host app.

---

## Custom domain (optional, free)

- **Vercel**: Project → Settings → Domains → add `anivi.app`; point your DNS at Vercel.
- **Render**: Service → Settings → Custom Domain → add `api.anivi.app`.
- Then set `VITE_WS_URL=wss://api.anivi.app/ws` (redeploy) and add the new web
  origin to `ANIVI_ALLOWED_ORIGINS`.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Stuck on "Connecting…" | Free instance waking up | Wait ~60s; it reconnects on its own |
| "Connecting…" forever | `VITE_WS_URL` wrong or still `ws://` | Fix the variable, **redeploy** the web app |
| Console: blocked by CORS | `ANIVI_ALLOWED_ORIGINS` doesn't list your Vercel origin | Add the exact origin, including `https://` |
| Console: mixed content | `ws://` on an HTTPS page | Use `wss://` |
| Pairing works, drawing doesn't | The WebSocket never upgraded (some proxies) | Check `curl -i https://host/ws` returns 400 "Bad Request" (upgrade required), not 404 |
| "This space isn't available any more" | The other person removed the connection, or this device is signed into a different account | Reconnect with their Anivi Code |
| Stuck on the Create Account screen | `MONGODB_URI` not set on the server — accounts need it | Set it in Render → Environment |
| Both partners show as one | Two tabs on the same origin share one pairing | Use two devices, or two different browsers |

Server logs: Render → your service → **Logs**. Every dropped connection and
bad message is logged there.
