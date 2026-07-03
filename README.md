# TheTextApp

A secure Telegram/Signal-style messaging app with **MoQ (Media over QUIC)** voice/video calls — no WebRTC or third-party streaming providers.

Built with Expo (iOS, Android, Web), tRPC, Drizzle ORM, Supabase Postgres, Better Auth (passkeys), and React Native Reanimated.

## Architecture

```
apps/mobile     → Expo Router app (APK + Web)
apps/server     → Hono API (Better Auth + tRPC)
packages/db     → Drizzle schema + migrations + Studio
packages/api    → Shared tRPC routers
packages/moq    → MoQ call client (@moq/net)
```

## Prerequisites

- Node.js 20+
- Supabase project (or any Postgres)
- For calls: MoQ relay ([public dev relay](https://relay.moq.dev) or self-hosted)

## Quick Start

### 1. Clone & install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
```

Set `DATABASE_URL` to your Supabase connection string:

```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Generate a secret:

```bash
openssl rand -base64 32
```

Set `BETTER_AUTH_SECRET` in `.env`.

### 3. Push database schema

```bash
npm run db:push
```

Open Drizzle Studio:

```bash
npm run db:studio
```

### 4. Start API server (Bun + Hono)

Requires [Bun](https://bun.sh) 1.1+:

```bash
npm run dev:server
```

API runs at `http://localhost:9001` using `Bun.serve` + Hono.

### 5. Start mobile/web app

```bash
npm run dev:mobile
```

- **Web**: press `w` or open `http://localhost:8081`
- **Android**: press `a` (requires emulator/device)
- **iOS**: press `i` (macOS only)

## Features

| Feature | Status |
|---------|--------|
| Expo (iOS, Android APK, Web) | ✅ |
| React Native Reanimated | ✅ |
| tRPC + TypeScript | ✅ |
| Drizzle ORM + drizzle-kit + Studio | ✅ |
| Supabase Postgres + Realtime | ✅ |
| Better Auth (email/password) | ✅ |
| Passkeys (Web + iOS + Android) | ✅ via `expo-better-auth-passkey` |
| E2E encryption (X25519 + AES-GCM) | ✅ |
| MoQ voice/video calls | ✅ Web |
| Bun + Hono API server | ✅ |

## MoQ Calling

Calls use [Media over QUIC](https://moq.dev/) via `@moq/net` — WebTransport + WebCodecs in the browser.

- **Web**: full audio/video via MoQ relay
- **Native (APK)**: messaging works; calls require web (MoQ needs browser APIs)

### Self-host MoQ relay (production)

```bash
docker compose -f infra/docker/moq-relay.yml up -d
```

Set `MOQ_RELAY_URL` in `.env`.

## Deployment

### Web (Vercel / Netlify)

1. Deploy `apps/server` as API (Railway, Render, Fly.io, or Vercel serverless)
2. Export Expo web: `cd apps/mobile && npx expo export --platform web`
3. Set `EXPO_PUBLIC_API_URL` to your API URL
4. Deploy `dist/` folder

See `vercel.json` and `netlify.toml` for templates.

### Android APK (EAS Build)

```bash
cd apps/mobile
npx eas build --platform android --profile preview
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:server` | Start API on port 9001 |
| `npm run dev:mobile` | Start Expo dev server |
| `npm run db:push` | Push schema to Supabase |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:generate` | Generate migrations |

## E2E Encryption

Messages are encrypted client-side before reaching the server:

- **Identity keys**: X25519 keypair generated on device, private key in SecureStore/localStorage
- **Direct chats**: ECDH-derived AES-256-GCM key per conversation
- **Group chats**: Random group key wrapped per member via ECDH
- Server stores only public keys and ciphertext — cannot read messages

Register identity keys automatically on first launch (Settings shows status).

## Passkeys (All Platforms)

Uses `expo-better-auth-passkey` — native passkeys on iOS/Android, WebAuthn on web.

**Production requirements:**
- HTTPS API with `PASSKEY_RP_ID` matching your domain
- For Android APK: add signing certificate SHA-256 to `PASSKEY_ORIGINS`

## Supabase Realtime

Enable replication on the `messages` table in Supabase Dashboard → Database → Replication.
Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for instant message delivery (falls back to polling without it).

## License

MIT
