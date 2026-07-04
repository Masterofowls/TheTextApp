# Fly.io deployment

## Apps (live)

| App | URL | Deploy |
|-----|-----|--------|
| `thetextapp-api` | https://thetextapp-api.fly.dev | `fly deploy . -a thetextapp-api --dockerfile infra/fly/server/Dockerfile -c infra/fly/server/fly.toml` |
| `thetextapp-moq` | https://thetextapp-moq.fly.dev/anon | `cd infra/fly/moq-relay && fly deploy` |

MoQ relay requires a dedicated IPv4 for UDP (already allocated on `thetextapp-moq`).

## API secrets

```bash
fly secrets set -a thetextapp-api \
  DATABASE_URL="..." \
  BETTER_AUTH_SECRET="..." \
  BETTER_AUTH_URL="https://thetextapp-api.fly.dev" \
  MOQ_RELAY_URL="https://thetextapp-moq.fly.dev/anon"
```

Optional: `CORS_ORIGINS`, `TRUSTED_ORIGINS`, `PASSKEY_RP_ID=thetextapp-api.fly.dev`, `PASSKEY_ORIGINS`.

## Mobile / web env

```bash
EXPO_PUBLIC_API_URL=https://thetextapp-api.fly.dev
EXPO_PUBLIC_MOQ_RELAY_URL=https://thetextapp-moq.fly.dev/anon
```

## Logs & status

```bash
fly status -a thetextapp-api
fly logs -a thetextapp-api
fly status -a thetextapp-moq
fly logs -a thetextapp-moq
```

