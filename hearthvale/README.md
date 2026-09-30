# Hearthvale

**Discord, but the server is a little world you can walk around in.**

**Live at [bigtomdev.fyi/hearthvale](https://bigtomdev.fyi/hearthvale)**

![A voxel village square surrounded by trees, houses and lamp-lit paths](apps/client/public/og-image.png)

Hearthvale turns a Discord server into a cosy, persistent voxel world:

| Discord | World |
|---|---|
| Server | The world (with a central square, "The Commons") |
| Category | A town, with a square, a sign and ring roads |
| Text / announcement channel | A house (announcements become towers) |
| Voice channel | An open-air voice gazebo that mirrors who's in the Discord voice channel |
| Member playing Hearthvale | A voxel character, animated and synced in real time |
| Member active in Discord but not in the world | A translucent "away" NPC by that channel's house |
| Message | A speech bubble over its author, plus the channel's in-house notice board |

You log in with Discord, pick a server, walk through its towns, step into a channel's house to read and post real messages, and talk to nearby players with proximity voice.

---

## Contents

- [Quick start](#quick-start-local-development)
- [Discord Developer Portal setup](#discord-developer-portal-setup)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Architecture](#architecture)
  - [Discord integration](#discord-integration)
  - [World generation](#world-generation)
  - [Multiplayer](#multiplayer)
  - [Voice](#voice)
  - [Security](#security)
  - [Database](#database)
- [Production deployment](#production-deployment)
  - [Current setup: Vercel + self-hosted backend](#current-setup-vercel--self-hosted-backend)
  - [Moving the backend to another machine](#moving-the-backend-to-another-machine)
  - [Link previews](#link-previews)
  - [Single-server Docker alternative](#single-server-docker-alternative)
- [Implemented features](#implemented-features)
- [Known limitations](#known-limitations)
- [Future improvements](#recommended-future-improvements)

---

## Quick start (local development)

**Requirements:** Node.js **22.13+** (built and tested on Node 24). No database server or Docker is needed for development.

```bash
npm install
cp .env.example .env        # then fill in the Discord values (see below)
npm run voice               # terminal 1: local LiveKit voice server (optional)
npm run dev                 # terminal 2: API/bot server (:3000) and Vite client (:5173)
```

Open **http://localhost:5173**.

- `npm run voice` uses the LiveKit binary in `tools/livekit/` if it exists, otherwise `livekit-server` on your PATH. Install it from [docs.livekit.io](https://docs.livekit.io/home/self-hosting/local/): download a release, `brew install livekit`, or `curl -sSL https://get.livekit.io | bash`. Its `--dev` mode uses the key `devkey` and secret `secret`, which are already in `.env.example`.
- To test multiplayer on one machine, use two **different Discord accounts**: a normal window plus a private window. Opening the same account twice makes the newer tab replace the older one.
- `http://localhost:5173/?sandbox` is a **dev-only** offline preview of the 3D world built from sample data. It needs no Discord. Add `&at=general&inside` or `&dist=55&pitch=0.9` to reposition the camera. It is stripped from production builds.

Other scripts: `npm run typecheck`, `npm test` (generator, multiplayer room, rate-limit and crypto tests), `npm run build`, `npm start`.

## Discord Developer Portal setup

1. Go to <https://discord.com/developers/applications> → **New Application**.
2. **OAuth2** page:
   - Copy the **Client ID** into `DISCORD_CLIENT_ID`.
   - **Reset Secret** and copy it into `DISCORD_CLIENT_SECRET`.
   - Under **Redirects**, add `http://localhost:5173/auth/callback`. For production, also add the backend's callback (`https://api.bigtomdev.fyi/auth/callback`). It must exactly match `DISCORD_REDIRECT_URI`.
3. **Bot** page:
   - **Reset Token** and copy it into `DISCORD_BOT_TOKEN`.
   - Under **Privileged Gateway Intents**, turn on **Message Content Intent**. Without it the bot receives empty message text. Presence and Server Members intents are **not** needed.
   - Optionally turn off **Public Bot** so only you can add it.
4. **Add the bot to your server.** Log in to Hearthvale: every server you manage that doesn't have the bot yet shows a **+ Add bot** card. Or use the OAuth2 URL generator with scope `bot` and these permissions:
   - View Channels
   - Send Messages
   - Read Message History
   - Manage Webhooks, so messages from the world show the player's name and avatar
   - Embed Links
   - Connect and Speak, for the Discord voice bridge

   If the bot can't manage webhooks in a channel, it posts as itself with the player's name in bold.
5. Private channels only appear in the world if the **bot** can see them. Players only see houses for channels **they** can see.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `APP_ORIGIN` | ✓ | Public URL the browser uses (`http://localhost:5173` in dev, `https://bigtomdev.fyi/hearthvale` in prod). It may include a path; after login you're redirected there. Its origin is the only one allowed by CORS and on WebSocket upgrades. |
| `PORT` | | Server port (default `3000`). |
| `SESSION_SECRET` | ✓ | 32+ random characters. It encrypts stored Discord tokens. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `DATABASE_URL` | | SQLite file (default `file:./data/hearthvale.db`). **Keep it outside OneDrive, Dropbox or other synced folders**: sync clients lock SQLite's files and the server hangs on startup. On Windows, for example: `file:C:/Users/<you>/AppData/Local/Hearthvale/hearthvale.db`. |
| `DISCORD_CLIENT_ID` | ✓ | Application ID. |
| `DISCORD_CLIENT_SECRET` | ✓ | OAuth2 client secret. **Server-only.** |
| `DISCORD_BOT_TOKEN` | ✓ | Bot token. **Server-only.** |
| `DISCORD_REDIRECT_URI` | ✓ | The backend's `/auth/callback`: `http://localhost:5173/auth/callback` in dev, `https://api.bigtomdev.fyi/auth/callback` in prod. |
| `LIVEKIT_URL` | voice | URL the **browser** uses to reach LiveKit (`ws://localhost:7880` in dev, `wss://voice.example.com` in prod). |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | voice | LiveKit credentials. **Secret is server-only.** Leave all three `LIVEKIT_*` blank to disable voice. |
| `LIVEKIT_SERVER_URL` | | URL the *server* uses to reach LiveKit, if it differs from `LIVEKIT_URL` (for example an internal Docker hostname). |
| `DISCORD_VOICE_BRIDGE` | | `true` (default) lets the bot join Discord voice channels to connect them to the world's gazebos. `false` makes gazebos show Discord voice presence only. |
| `CHAT_RATE_LIMIT` / `CHAT_RATE_WINDOW` | | Messages a player can send from the world: N per W seconds (default 5 per 10). |

The server validates all of these on boot and prints a readable list of anything missing. `.env` is gitignored. No secret is ever sent to the browser.

`npm run dev` reads `.env`. `npm run start:prod` reads `.env.production` instead (also gitignored), so dev and production can use different databases and URLs.

**Client build variables.** These are baked into the static frontend at build time. They're public, so never put secrets in them.

| Variable | Description |
|---|---|
| `VITE_BASE` | Path the site is served under, with leading and trailing `/` (default `/`; prod `/hearthvale/`). |
| `VITE_API_ORIGIN` | Backend origin when it's on a different domain from the frontend (prod `https://api.bigtomdev.fyi`). Leave unset when one server serves both. |
| `VITE_SITE_URL` | Absolute public URL of the site, used for [link previews](#link-previews) (prod `https://bigtomdev.fyi/hearthvale/`). |

## Project structure

```
hearthvale/
├─ packages/shared/            # Used by both server and client
│  └─ src/
│     ├─ protocol.ts           # WebSocket message types + zod validation
│     ├─ character.ts          # Appearance/preferences schemas, presets
│     ├─ constants.ts          # Speeds, tick rates, voice ranges, chat limits
│     └─ world/
│        ├─ generate.ts        # Deterministic world generator (+ tests)
│        ├─ layout.ts          # World data model
│        ├─ zones.ts           # "Which house/town am I in?"
│        └─ rng.ts             # Seeded hashing/PRNG
├─ apps/server/                # Fastify + ws + discord.js
│  └─ src/
│     ├─ index.ts              # Wiring/bootstrap
│     ├─ config.ts             # Env validation
│     ├─ auth/                 # OAuth2 client, sessions, token encryption, routes
│     ├─ discord/              # Gateway bot, permission checks, message bridge/webhooks
│     ├─ world/worldService.ts # Discord structure → persisted slots → per-user world
│     ├─ realtime/             # WebSocket hub, per-guild rooms (interest mgmt), rate limits
│     ├─ voice/                # LiveKit token minting, Discord voice bridge
│     ├─ api/routes.ts         # REST: me, guilds, character, prefs, messages, voice token
│     └─ db/                   # SQLite schema/migrations + repositories
├─ apps/client/                # Vite + three.js (no UI framework)
│  └─ src/
│     ├─ main.ts               # Login → server picker → world
│     ├─ game/                 # Engine, world builder, player, camera, collision, avatars, ambience
│     │  └─ assets/            # Voxel buildings, props, characters, text signs
│     ├─ voice/voice.ts        # LiveKit + Web Audio spatialisation
│     ├─ net/socket.ts         # Reconnecting WebSocket
│     ├─ ui/                   # HUD, chat panel, character editor, settings, screens, icons, Discord markdown
│     └─ dev/                  # Dev-only sandbox & voice harness (not in prod builds)
│  └─ public/                  # favicon, og-image.png (link preview)
├─ scripts/voice.mjs           # `npm run voice`
├─ vercel.json, .vercelignore  # Frontend deployment
├─ Dockerfile, docker-compose.yml, Caddyfile, livekit.yaml
└─ .env.example
```

## Architecture

```
Discord ──gateway──▶ Bot (discord.js) ──┐
   ▲                                    ▼
   └── REST / webhooks ◀────── Backend (Fastify)
                                 ├─ Auth: Discord OAuth2, sessions
                                 ├─ WorldService: structure → slots (SQLite)
                                 ├─ Realtime: per-guild rooms over WebSocket
                                 └─ Voice: mints LiveKit tokens
                                        │                    
               WebSocket (JSON) ◀───────┘      LiveKit SFU (WebRTC audio)
                     │                                ▲
                     ▼                                │
                Game clients (three.js) ──────────────┘
```

One Node process runs the HTTP API, the OAuth flow, the WebSocket server and the Discord bot. Voice audio goes browser ⇄ LiveKit directly and **never passes through the app server**.

### Discord integration

- **Login:** OAuth2 authorization-code flow with scopes `identify guilds`. A `state` cookie guards against CSRF. Tokens are encrypted at rest with AES-256-GCM and refreshed when they expire. If the refresh token is revoked, the session ends and you're asked to log in again.
- **Server picker:** your guilds (from OAuth) intersected with the guilds the bot is in. Servers you manage that don't have the bot get an "Add bot" link.
- **Access is verified by the bot, never the client.** When you join a world, the server fetches your guild member record through the bot. It computes per-channel permissions from Discord's roles and overwrites (`ViewChannel`, `SendMessages`, `ReadMessageHistory`, timeouts). Houses for channels you can't see are not sent to you at all.
- **Live structure sync:** gateway events cause a debounced resync of the guild's structure into the database:
  - `CHANNEL_CREATE`, `CHANNEL_UPDATE`, `CHANNEL_DELETE`
  - `GUILD_UPDATE`, role updates

  New channels get new houses. Renamed channels get new signs. Channels moved to another category move to that town. **Deleted channels become boarded-up "closed" houses** for 3 days, then their plot is recycled. Connected players receive the new world live.
- **Discord → world messages:** each `MESSAGE_CREATE` is delivered only to players who can view that channel. If the author is in the world, the bubble appears over their character. Otherwise a translucent NPC by the channel's house speaks it. The house's message icon also pings.
- **World → Discord messages:** step inside a house, press **Enter**, type and send. The server:
  1. re-fetches your member record
  2. re-checks `SendMessages` and timeouts
  3. rate-limits the send
  4. posts through a per-channel webhook with your display name and avatar and `allowed_mentions: none`, so the world can't be used to mass-ping

  The message shows up in Discord and, instantly, in the world.
- **Recent history** is fetched from Discord on demand when you enter a house, cached for 30 seconds in memory, and **never stored**.
- **Voice channels** are mirrored through `GUILD_VOICE_STATES`. Each voice channel's gazebo shows seated NPCs for the people currently in that Discord voice channel, and players can talk with them through the [voice bridge](#voice).

### World generation

`packages/shared/src/world/generate.ts` is a pure, deterministic function. Both the server and every client run it, so the server only sends a compact **world spec**: towns, buildings, slots and capacities. Each client builds the identical world locally.

- **Stable slots.** The server stores a *slot* per town and per channel. Positions depend only on the guild ID, the slot and the town's reserved capacity, never on how many channels exist. Adding a channel never moves existing houses. A test enforces this.
- **Town growth.** A town's capacity only grows, rounded up in steps of 6. Houses sit on concentric rings around a town square with a centrepiece (fountain, well, cherry tree or bonfire). Rings are added as a category grows, so big categories become big towns.
- **Natural layout.** Each house has jittered angle and radius, faces the square, and gets its own lane, garden, mailbox and fences. There's a gap in the rings for the main road. Empty plots become groves or flower gardens.
- **Placing towns.** Towns sit on a golden-angle spiral around the hub. Placement rejects spots where towns would overlap or where a main road would cut through another town.
- **Between towns.** Roads carry lamps, creeks with bridges and signposts. The wilderness is scattered with forests clustered by noise.
- **Styles.** Cottage, tall house, longhouse, shop (with awning) and tower (announcements). Colours come from per-town palettes, and every house has a furnished interior.
- **Rendering:**
  - Everything voxel is merged into vertex-coloured geometry: one draw call per house.
  - Props use `InstancedMesh`, so a few thousand trees and flowers cost a handful of draw calls.

### Multiplayer

- **Transport:** a raw WebSocket (`ws`) with the session cookie checked on upgrade and an Origin check. Every client message is validated with zod, and a per-socket flood limit applies.
- **Rooms:** one `GuildRoom` per Discord server, created on the first join and disposed when empty.
- **Movement:** clients predict their own movement and send position, rotation and animation state at 15 Hz, only when something changed. The server clamps impossible movement (faster than running, or outside the world) and sends a correction.
- **Interest management:** a spatial hash. Every 10 Hz tick, each client gets only players within 90 m, as `add` / `remove` / compact `[id,x,y,z,ry,anim]` updates. Far-away players cost nothing.
- **Interpolation:** remote players render about 200 ms in the past, interpolated between snapshots, and animate from their movement.
- **Persistence and cleanup:** appearance and voice-state changes are broadcast to players who can see you. Characters are saved to the database. A second tab for the same account replaces the first.

### Voice

**Discord voice channels are bridged into the world.** Browser users can't join Discord voice as themselves: the RPC voice scopes are partner-only, and self-bots break Discord's Terms. A **bot** can join, though, so the server acts as a two-way bridge (`apps/server/src/voice/bridge.ts`):

- **Starting a call.** When a player walks into a voice channel's gazebo, the Hearthvale bot joins that Discord voice channel, using `@discordjs/voice` with DAVE end-to-end encryption through `@snazzah/davey`.
- **Discord to world.** Each Discord user's audio is decoded and published into a per-channel LiveKit room (`guild-<g>-vc-<c>`) as its own track. Players standing in the gazebo hear them as if on a call, and those users' seated NPCs light up while they talk.
- **World to Discord.** Audio from players in the gazebo is mixed, Opus-encoded and played into the Discord channel by the bot. The bot pauses when nobody in the world is talking, so it doesn't show a permanent speaking ring in Discord.
- **Server-side checks:**
  - you must be standing in the gazebo, verified from your server-side position
  - you need Discord **Connect** permission to listen, and **Speak** to be heard
  - walking out removes you from the call immediately
- **Limits:**
  - A bot can be in only **one voice channel per server**, so one channel per server is bridged at a time. Other gazebos say the bridge is busy, and their players can still hear each other in the world.
  - The bridge stops about 20 seconds after its gazebo empties.
- **Caveats:**
  - Receiving voice isn't officially documented by Discord, so the bridge reports errors in the prompt instead of breaking voice.
  - The bot is visibly in the Discord channel while bridging, so Discord users know the world can hear them.
  - Set `DISCORD_VOICE_BRIDGE=false` to turn the bridge off.

Proximity voice in the rest of the world is independent, running over WebRTC through a self-hostable **LiveKit** SFU. The app server only mints short-lived tokens (microphone publishing only, one room per Discord server, identity = Discord user ID, after re-verifying membership).

How it works on the client (`apps/client/src/voice/voice.ts`):

- **Permission:** the microphone is requested **only when you click "Join voice"**. If you deny it, have no mic, or the mic is busy, you join **listen-only** with a clear message.
- **Selective subscription:** you only subscribe to speakers within about 32 m, so bandwidth scales with the local crowd.
- **Spatial audio:** each speaker's track runs through your own Web Audio chain:
  - low-pass filter for wall occlusion
  - gain for distance: full volume up to 3 m, fading to silence at 28 m
  - stereo panner for direction, relative to your camera
- **Rooms and walls:**
  - Same house or gazebo: clear audio.
  - One of you inside a house and the other outside: about 35% volume with a 900 Hz muffle.
- **Speaking indicators:** your own voice-activity detection per track, merged with LiveKit's speaker detection. The name tag glows and a ring pulses under the character.
- **Controls:** mute, deafen, push-to-talk (rebindable, default **V**), voice activity with noise suppression and echo cancellation, microphone and output device selection (output where the browser supports `setSinkId`), voice volume, a mic level meter, connection status, and automatic reconnect with backoff.

I verified this end to end with two headless browsers through a real LiveKit server. Measured gain, pan and occlusion:

| Speaker position | Gain | Pan | Low-pass |
|---|---|---|---|
| 2 m | 1.0 | centre | none |
| 10 m right | 0.59 | +0.85 | none |
| 10 m left | 0.59 | −0.85 | none |
| 20 m | 0.16 | centre | none |
| 60 m | unsubscribed | — | — |
| Through a wall | 0.31 | centre | 900 Hz |

### Security

- **Secrets:** only in environment variables. The server validates them on boot and never sends them to the client.
- **Sessions:** opaque random cookie (`HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS). The DB stores only a SHA-256 of the cookie value, and Discord tokens are encrypted with a key derived via HKDF from `SESSION_SECRET`.
- **CSRF:** OAuth `state` cookie, SameSite cookies, a required `X-Hearthvale` header on mutating API calls, and an Origin check on WebSocket upgrades.
- **Authorisation:** every membership and permission decision comes from Discord data fetched by the bot. Client-supplied IDs are only ever *lookups* that get re-checked.
- **Voice follows Discord permissions:** the server tracks which house or gazebo each player is in and decides whether they may talk there. Inside a text channel's house you need Send Messages. In a voice gazebo you need Connect and Speak. Anywhere, being timed out or server-muted in Discord blocks talking. The server enforces this in LiveKit itself, revoking the player's publish permission so their mic is removed, not just greyed out in the UI. It re-checks on every zone change, permission change and voice-state change, and every 30 seconds for timeouts and role changes.
- **Input:** zod schemas for all REST bodies and WebSocket messages. Messages are limited to 2000 characters, trimmed, and sent with mentions disabled.
- **Rate limits:** global HTTP limit, per-route limits (history, voice tokens), a per-user chat token bucket, and a per-socket message flood guard.
- **XSS:** Discord markdown is rendered by escaping everything first, then applying a fixed tag whitelist. Links must be http(s) and open with `noopener noreferrer`.

### Database

SQLite through Node's built-in `node:sqlite` (WAL mode; migrations in `apps/server/src/db/index.ts`). All access goes through `repos.ts`, so moving to Postgres only touches that layer.

| Table | Purpose |
|---|---|
| `users` | Discord ID (primary key), username, display name, avatar hash |
| `sessions` | Hashed session ID, encrypted access/refresh tokens, expiry |
| `guilds` | Guild ID, name, icon, `world_version` |
| `towns` | `(guild, category)` → name, **slot**, **capacity** |
| `channels` | Channel ID → town, name, kind, topic, **slot**, active / `deleted_at` |
| `characters` | User → appearance JSON (validated) |
| `preferences` | User → preferences JSON (voice mode, PTT key, devices, volumes, …) |
| `world_messages` | **Metadata only** (message ID, channel, author, time) for messages sent from the world. Used for attribution and auditing, purged after 30 days. |
| `active_players` | Who is currently in which world (operational view; live state is in memory) |

Message content is never stored. Discord IDs are the stable external keys everywhere.

## Production deployment

The backend needs a long-running process (the Discord bot and WebSockets) and a persistent disk (SQLite), so it can't run on serverless hosts like Vercel or Netlify. The frontend is static files and can go anywhere.

### Current setup: Vercel + self-hosted backend

```
Browser ──▶ bigtomdev.fyi/hearthvale ──▶ Vercel (static frontend)
   │
   ├──────▶ api.bigtomdev.fyi ──▶ Cloudflare Tunnel ──▶ backend (npm run start:prod, port 3000)
   │
   └──────▶ LiveKit Cloud (voice)
```

| Piece | Where | Cost |
|---|---|---|
| Frontend | Vercel, built with the command in `vercel.json` | Free (Hobby plan) |
| Backend + Discord bot | Any always-on machine, reached through a Cloudflare Tunnel | Free (your own machine) |
| Voice | LiveKit Cloud | Free tier |
| DNS | Cloudflare: `@` A record `76.76.21.21` (Vercel, DNS only); `api` CNAME `<tunnel-id>.cfargotunnel.com` (proxied) | Domain only |

- **Deploy the frontend:** `npx vercel --prod` from the repo root. Vercel runs `npm run build:vercel` (`scripts/build-vercel.mjs`), which builds Hearthvale, OmniPrice, Homebase and the site pages into `apps/client/dist/`. `.vercelignore` keeps `.env*`, `data` and `tools` out of the upload.
- **Run the backend:** `npm run start:prod`. It builds the server and starts it with `.env.production`.
- **Discord Developer Portal:** OAuth2 → Redirects must include `https://api.bigtomdev.fyi/auth/callback`.
- The site only works while the backend machine is on. For a free always-on machine, an **Oracle Cloud Always Free** VM works well. Free tiers that sleep when idle (Render, Koyeb) disconnect the bot and lose the database, so avoid them.

### Moving the backend to another machine

1. Install **Node.js 24** (22.13+ minimum; the server uses the built-in `node:sqlite`).
2. Copy the project **without** `node_modules`, `data`, `tools`, `apps/*/dist` or `apps/*/node_modules`. Then run `npm ci` on the new machine: the voice and Opus packages install different native builds per operating system.
3. Copy `.env.production` privately (never commit it or send it over chat). Change `DATABASE_URL` to a path on the new machine **outside any synced folder** such as OneDrive.
4. Optional: to keep characters and settings, stop the old server and copy its database file (`hearthvale-prod.db`) to that path.
5. Install the tunnel connector. In Cloudflare, go to **Zero Trust → Networks → Tunnels**, open the tunnel, choose **Configure**, and run the `cloudflared service install <token>` command it shows for the new OS. DNS doesn't change.
6. Start it with `npm run start:prod`. To survive reboots, use pm2 (`npm i -g pm2`, `pm2 start npm --name hearthvale -- run start:prod`, `pm2 save`, `pm2 startup`) or a systemd service.
7. **Shut down the old machine's server and tunnel** (`cloudflared service uninstall`). If both run, Cloudflare splits visitors between two servers with separate databases.

Vercel, Discord and LiveKit need no changes, because `api.bigtomdev.fyi` stays the same.

### Big Tom Dev site

The same Vercel project also serves the Big Tom Dev site around Hearthvale:

| Path | Page |
|---|---|
| `/` | Home: collections of bigger projects |
| `/the-big-7/` | The Big 7: showcases for Hearthvale, OmniPrice, Homebase and Cardhouse, plus three "coming soon" slots |
| `/privacy/`, `/terms/`, `/cookies/` | Legal pages covering the site and every app |
| `/hearthvale/`, `/omniprice/`, `/homebase/`, `/cardhouse/` | The apps |

- The pages are HTML fragments in `site/pages/`, and the styles, logo and images are in `site/assets/`.
- `node scripts/build-site.mjs` (also `npm run build:site`) wraps each page in the shared banner and footer. The banner has the logo, "Big Tom Dev" and two tabs, Home and The Big 7. Projects are reached from those pages, not from the banner. It writes the result into `apps/client/dist/` next to the app, and Vercel runs it after the client build.
- The contact email and the "last updated" date for the legal pages are set at the top of `scripts/build-site.mjs`.
- To fill one of the Big 7 slots, replace its `<section class="slot">` in `site/pages/big7.html`.

**Privacy features in Hearthvale:**
- Settings → Account has **Download my data** (`GET /api/me/export`) and **Delete my data** (`POST /api/me/delete`). Delete erases every row for the user, revokes the Discord token and disconnects them.
- The login screen shows a consent line and legal links.
- Fonts are self-hosted, so there are no Google Fonts requests.

### OmniPrice

OmniPrice (`/omniprice/`, project 02 of The Big 7) tracks and compares prices: food, wages, energy, commodities, currencies, crypto, inflation and interest rates. Stocks and ETFs are included once a key is set.

| Part | Where |
|---|---|
| App (Vite + TypeScript + uPlot) | `apps/omniprice/`, built into `apps/client/dist/omniprice/` |
| Data API (Vercel Function) | `api/omniprice.js` → `api/_omniprice/` (catalogue, fetchers, handler) |
| Source check | `npm run check:omniprice`: fetches every series and flags failures or stale data |

- **Run it locally:** `npm run dev:omniprice` → <http://localhost:5174/omniprice/>. The Vite dev server runs the same API handler.
- **Sources:**
  - FRED CSV (public domain BLS, EIA and Federal Reserve series; IMF commodities; OECD)
  - ONS time series (OGL v3)
  - ECB reference rates via Frankfurter
  - CoinGecko
  - Twelve Data (stocks)

  S&P, Dow Jones and Nasdaq index levels are not used, because their licences forbid redistribution. Stock exposure is shown through ETFs instead.
- **Optional environment variables (Vercel → Settings → Environment Variables):**
  - `TWELVE_DATA_API_KEY` turns on the Stocks & ETFs category. A free key from twelvedata.com is enough, since the 8 tickers fit its per-minute limit.
  - `FRED_API_KEY` switches FRED requests to the official API, which is more reliable than the CSV download. The key is free from fred.stlouisfed.org.
- **Adding a series:** add an entry to `INSTRUMENTS` in `api/_omniprice/catalog.js`, run `npm run check:omniprice <id>`, then deploy. Only use sources whose licence allows public display, and credit them in `SOURCES`.
- **Caching:** data is cached in the function's memory and at Vercel's CDN (30 minutes for daily series, 6 hours for monthly), so upstream providers see very little traffic.
- **What's covered:** 141 series, including 52 currency pairs (every ECB currency against GBP, plus the main USD and EUR pairs) and 39 wage series (UK pay by sector from the ONS, US pay by industry from the BLS, and the US minimum wage).
- **Display currency:** the "Prices in" menu passes `cur=XXX` to the API, which converts money series (those with a `ccy`) using ECB rates: the daily rate for daily and weekly data, and the period average for monthly and quarterly data. Rates, indices and percentages are never converted. The choice is kept in `localStorage` (`omniprice.currency`), which the Cookie Policy lists.
- **FRED throttling:** FRED can temporarily block an IP that makes many CSV requests quickly. In production, set `FRED_API_KEY` so the function uses the official API.

### Homebase

Homebase (`/homebase/`, project 03 of The Big 7) is a private browser start page. It's a from-scratch rebuild inspired by the "VoidTab" page in [limehell/browser-home-page](https://github.com/limehell/browser-home-page). No code was copied: that repository has no licence.

| Part | Where |
|---|---|
| App (Vite + TypeScript, no framework) | `apps/homebase/`, built into `apps/client/dist/homebase/` |
| Themes | `src/themes/`: `gl.ts` (WebGL fragment shaders), `particles.ts` (canvas 2D), `index.ts` (registry + customisable params) |
| Renderer | `src/engine.ts`: DPR-aware sizing, adaptive resolution, pause when hidden, reduced-motion support, CSS fallback without WebGL |
| Widgets | `src/widgets/` (20 widgets; settings forms are generated from each widget's `fields`) |
| Settings & guide | `src/ui/panel.ts` (themes, customise, look, widgets, general, data), `src/ui/guide.ts` (browser setup tutorials with browser detection) |

- **Run it locally:** `npm run dev:homebase` → <http://localhost:5175/homebase/>. The currency and market widgets call the OmniPrice API through the same dev middleware.
- **First-visit defaults** (`defaultState()` in `src/store.ts`): the City Rain theme, Google search, no quick-links widget, website icons on, and the Big Tom Dev bar off (it can be turned on in Customise → Look). These only apply to new visitors or after a reset.
- **Storage:** everything lives in the browser. Settings are in `localStorage` (`homebase.v1`), photos in IndexedDB (`homebase`), and weather is cached for 20 minutes. Users can back up and restore via Customise → Data.
- **Adding a theme:** add a `ThemeDef` to `THEMES`. `params` automatically become controls in the Customise tab. Use `glScene(canvas, fragmentShader, uniformsFn)` for shaders, or the `canvas2d` helper for particles.
- **Adding a widget:** export a `WidgetDef` and list it in `src/widgets/index.ts`. Any `fields` automatically become its settings dialog.
- **Third-party services:**
  - Open-Meteo (weather, CC BY 4.0, credited in the widget)
  - DuckDuckGo icons (on by default, can be turned off)
  - the user's chosen search engine

  All of these are disclosed in the Privacy Policy.

### Cardhouse

Cardhouse (`/cardhouse/`, project 04 of The Big 7) is an online card room built for phones. Your hand fills the screen, you swipe sideways through your cards, and you swipe up (or tap the handle) for your chips, the board, the dealer and the other players. Games: Blackjack, Three Card Poker, Texas Hold'em, Five Card Draw and nine-card poker. **Play money only:** chips are free and can't be bought or cashed out. The original plan is in [docs/cardhouse-plan.md](docs/cardhouse-plan.md).

| Part | Where |
|---|---|
| Rules engine (pure TypeScript, no I/O) | `packages/cards/`: `cards.ts` (deck, `crypto.randomInt` shuffle, 5-card and 3-card ranking), `poker.ts` (no-limit betting, side and split pots, for Hold'em, Draw and nine-card), `house.ts` (Blackjack and Three Card Poker against a dealer) |
| Game server | `apps/server/src/cards/cardServer.ts`: the `/cards` WebSocket on the existing backend (`wss://api.bigtomdev.fyi/cards`) |
| App (Vite + TypeScript, no framework) | `apps/cardhouse/`, built into `apps/client/dist/cardhouse/` |

- **Run it locally:** start the backend (`npm run dev`), then `npm run dev:cardhouse` → <http://localhost:5176/cardhouse/>. Vite proxies `/cards` to the backend on port 3000. Open a second browser window to play against yourself.
- **Deploying:** `npm run build:vercel` builds the app. The backend needs rebuilding and restarting on the server machine (`npm run build`, then `npm run start:prod`) to get the `/cards` endpoint. Nothing new to configure: it uses the existing tunnel and `APP_ORIGIN` for its Origin check.
- **Server-authoritative:** the server shuffles, deals, checks every action and pays out. Each player gets a view built for them only, so other players' face-down cards, the dealer's hole card and the deck order never leave the server.
- **Tables:** create one and share the 5-letter code or link (`?table=CODE`). No account: players pick a nickname. A random seat token in `sessionStorage` (`cardhouse:seat`) lets a player rejoin after a refresh or dropped connection. Seats offline for 2 minutes are dropped between hands.
- **Turn timer:** 30 seconds. Timing out gives the safe move (check or fold, stand, stand pat, or sit out the betting round) and sits the player out until they tap "Deal me in".
- **Chips:** 1,000 to start; anyone below 1,000 can top up to 1,000 between hands.
- **Limits:** tables live in memory (a server restart ends them), at most 500 tables, 10 new tables per IP per 10 minutes, and 20 messages per 10 seconds per connection. Every message is checked with zod.
- **Tests:** `npm test -w @bigtomdev/cards` (hand ranking, side pots, split pots, draw rules and random-play simulations, including 10,000 Blackjack hands, that check no chip is ever created or lost) and `src/cards/cardServer.test.ts` in the server (two players over real WebSockets, a mid-hand rejoin, and hidden cards).
- **Nine-card poker rules are a placeholder** until confirmed: five cards, a betting round, four more cards, a second betting round, best five of nine. It's capped at 5 players so the deck never runs out.
- **Known simplification:** a short all-in raise reopens betting for everyone, where strict rules only let players who have already acted call.

### Link previews

Pasting the link into Discord, Slack, X or iMessage shows a card with the title, description and `apps/client/public/og-image.png` (1200×630). The tags are in `apps/client/index.html`. Image URLs must be absolute, so they're built from `VITE_SITE_URL` at build time.

- Each app has its own preview image, for example `apps/cardhouse/public/og-cardhouse.png`.
- To change the image, replace `og-image.png` (PNG or JPG; SVG isn't supported by Discord) and redeploy.
- Discord caches embeds. To see changes on an already-posted link, add a throwaway query string, for example `https://bigtomdev.fyi/hearthvale/?v=2`.

### Single-server Docker alternative

The simplest self-contained setup is one Linux VPS (2 GB RAM or more) running `docker compose`. The stack is:

- **Caddy**: automatic HTTPS
- **app**: web, WebSocket and Discord bot
- **LiveKit**: voice

1. **DNS:** point two A records at the server, for example `world.example.com` and `voice.example.com`.
2. **Firewall:** open TCP `80`, `443` and `7881`, and UDP `50000-50100`.
3. **LiveKit keys:** in `livekit.yaml`, replace `CHANGE_ME_KEY: CHANGE_ME…` with your own key and a 32+ character secret.
4. **`.env` on the server:**
   ```
   APP_DOMAIN=world.example.com
   VOICE_DOMAIN=voice.example.com
   APP_ORIGIN=https://world.example.com
   DISCORD_REDIRECT_URI=https://world.example.com/auth/callback
   LIVEKIT_URL=wss://voice.example.com
   LIVEKIT_API_KEY=<key from livekit.yaml>
   LIVEKIT_API_SECRET=<secret from livekit.yaml>
   SESSION_SECRET=<fresh random value>
   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_BOT_TOKEN as before
   ```
   `DATABASE_URL` and `LIVEKIT_SERVER_URL` are set by the compose file.
5. **Discord Developer Portal:** add `https://world.example.com/auth/callback` under OAuth2 → Redirects.
6. **Start it:** `docker compose up -d --build`. Check it with `docker compose logs -f app`.

Data lives in the `hearthvale-data` Docker volume; back it up.

If you'd rather not run voice yourself, use [LiveKit Cloud](https://livekit.io/cloud) (free tier): set `LIVEKIT_URL/KEY/SECRET` to its values, remove the `livekit` service and the voice site from the Caddyfile, and set `LIVEKIT_SERVER_URL` to the same `wss://` URL. The app then runs on any always-on host that supports Docker with a persistent volume and WebSockets, such as Railway or Fly.io (paid) or a free Oracle Cloud VM.

## Implemented features

- ✅ Discord OAuth login and logout, token refresh, expired and revoked session handling
- ✅ Server picker (servers with the bot, plus "add bot" for servers you manage)
- ✅ World generated live from real categories and channels; permission-filtered per player; stays in sync with channel create, rename, move, delete and permission changes
- ✅ Towns per category with a square, centrepiece, signposts and ring roads; houses per text channel (5 styles, furnished and enterable, roof hides when you're inside); voice gazebos per voice channel
- ✅ Cosy voxel environment: trees (4 kinds), flowers, bushes, rocks, mushrooms, lamps with glow, benches, fences, crates, barrels, hay, mailboxes, creeks with bridges, a fountain square, sky dome, clouds, pollen motes, warm light and shadows, fog
- ✅ Third-person controller: WASD, Shift to run, Space to jump (with coyote time), drag to look, scroll to zoom, collision with walls and props, standing on benches, bridges and crates, smooth camera that pulls in near walls
- ✅ Real-time multiplayer with interest management, interpolation and server sanity checks
- ✅ Voxel characters: 4 body types, 6 hair styles, optional facial features (eye and mouth styles, blush), 20 accessories worn up to 6 at once (one hat, eyewear, neck and back item each) with their own colours, 6 presets; walk, run, idle, jump and sit animations; saved per user
- ✅ Speech bubbles (Discord formatting, capped length, stacking, fade-out, distance culling, configurable duration)
- ✅ Channel panel inside houses: recent history, Discord formatting, sending as you through a webhook, send acknowledgement and errors, read-only state
- ✅ Idle NPCs for recently active members who aren't in the world, clearly labelled "… · away"; seated NPCs for members in Discord voice
- ✅ Proximity voice: spatial and stereo, wall occlusion, clear audio within the same room, speaking indicators, mute, deafen, push-to-talk, device selection, volume, listen-only fallback, reconnect
- ✅ HUD (server, town and channel, connection status, character, settings, leave), toasts, loading and error screens, settings (voice, ambient volume, mouse sensitivity, bubble duration, brightness), procedural ambient birdsong and breeze
- ✅ Discord voice bridge: talk with people in a Discord voice channel from its gazebo
- ✅ Icon set (Lucide) across the UI and in-world signs, and a link-preview card when the URL is shared

## Known limitations

- **Voice bridge:** one Discord voice channel per server at a time (a Discord limit on bots). Receiving Discord voice is undocumented by Discord and may break with future Discord changes. Discord users are heard as a call inside the gazebo, not spatially across the world.
- **Channel types:** forum, media and thread channels aren't mapped to buildings yet. Message edits aren't reflected live (deletes are).
- **Idle NPCs** come from people seen posting since the server started, plus the history loaded when someone enters a house. Discord has no "recently active members" API without the privileged Presence intent, which we deliberately don't request.
- **Scaling:** a single server process holds rooms in memory, and SQLite is single-node. That's fine for many small and medium communities at once, but not yet for horizontal scaling.
- **Movement is client-authoritative** with server clamping: good enough for a social space, not for competitive play.
- **Browser requirements:** mic access needs HTTPS (or `localhost`). Output-device selection needs `AudioContext.setSinkId` (Chromium). No mobile or touch controls yet.
- **Bundle size:** the client JS is about 330 KB gzipped (three.js plus LiveKit).
- **Testing coverage:** the Discord-facing code (gateway events, webhooks, member fetches) is type-checked against discord.js v14. It couldn't be exercised end to end in this environment without real bot credentials. Everything else was run: generator tests, room, rate-limit and crypto tests, HTTP and WebSocket security smoke tests, a two-browser LiveKit voice test, and rendering checks in a headless browser.

## Recommended future improvements

1. **Scale out:** Postgres through the existing repository layer. Redis pub/sub (or sticky sessions by guild) so rooms can live on multiple nodes, with the bot sharded through discord.js sharding.
2. **World streaming:** chunk the wilderness and houses by region and build geometry lazily. Merge distant towns into low-detail impostors.
3. **Richer Discord mapping:** forums as notice-board halls whose threads are rooms; threads as side rooms; live message edits and reactions (emoji floating up); pinned messages as posters; role colours on name tags; custom emoji rendering.
4. **Voice:** multiple bridge bots to bridge several voice channels at once; HRTF panning for headphones; per-player volume; moderator tools (server mute in the world).
5. **Moderation:** respect Discord bans and kicks in real time (member intent), reporting in the world, admin UI for world options (seasonal themes, town decorations).
6. **Gameplay polish:** day/night cycle tied to real time, weather, emotes and sit-on-bench, footstep sounds, minimap and "teleport to town", touch controls, custom house decorating stored per channel.
7. **Ops:** structured metrics (rooms, players, message latency), Sentry, CI running `npm run typecheck && npm test && npm run build`, and Playwright e2e tests against a staging Discord server.
