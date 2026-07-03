# TheTextApp Setup (Windows)

Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example - UPDATE DATABASE_URL and BETTER_AUTH_SECRET" -ForegroundColor Yellow
}

if (-not (Test-Path "apps/mobile/.env")) {
  Copy-Item "apps/mobile/.env.example" "apps/mobile/.env"
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "  1. Set DATABASE_URL in .env (Supabase Postgres)"
Write-Host "  2. Set BETTER_AUTH_SECRET (openssl rand -base64 32)"
Write-Host "  3. npm run db:push"
Write-Host "  4. npm run dev:server   (port 9001)"
Write-Host "  5. npm run dev:mobile   (Expo)"
