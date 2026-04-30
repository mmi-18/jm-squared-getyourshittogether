# Get Your Shit Together

Personal task manager built around the Eisenhower Matrix. Urgent × Important,
drag-and-drop, hierarchical tags, recurring tasks, offline-first PWA.

Production: `https://getyourshittogether.jm-squared.com`

## Stack

- **Next.js 16** (App Router) + **React 19** + **Tailwind 4** + **@base-ui/react**
- **Prisma 6** + **Neon Postgres 17** (pooled `DATABASE_URL` for runtime,
  direct `DIRECT_URL` for migrations)
- **BetterAuth 1.6** (email + password, single-user lockdown)
- **@dnd-kit/core** for touch-capable drag-and-drop (works on iOS Safari PWA)
- **Dexie** for the IndexedDB local cache + offline write queue
- **@serwist/next** for the PWA service worker
- **Docker** on Hetzner CPX22 behind Traefik v3.6, deployed via GitHub Actions
  → GitHub Container Registry → SSH pull

## Local dev

```bash
cp .env.example .env       # fill in real values (Neon URLs, BETTER_AUTH_SECRET)
npm install
npm run prisma:migrate     # apply migrations to the dev Neon branch
npm run dev                # http://localhost:3000
```

`npm install` runs `prisma generate` via the postinstall hook.

## Deploy

`git push origin main` → GitHub Actions builds the Docker image, pushes to
`ghcr.io/mmi-18/jm-squared-getyourshittogether:latest`, then SSHes into the
Hetzner box and `docker compose pull && docker compose up -d`.

Migrations apply at container start via `scripts/entrypoint.sh` →
`prisma migrate deploy`.

## Architecture notes

- **Auth**: BetterAuth's User table is extended with domain `additionalFields`
  (`theme`, `timezone`, `defaultFilters`) so settings live on the User row
  rather than a parallel `UserSettings` table. See `src/lib/auth.ts`.
- **No RLS**: ownership is enforced in server actions via `requireUser()`.
  RLS adds operational complexity for no real safety win when a single
  trusted server is the only client.
- **Soft delete**: every user-mutable table has a `deletedAt` tombstone.
  The sync engine reads `(updatedAt > clientLastSync OR deletedAt > clientLastSync)`
  so deletions propagate across devices without a per-row deletion log.
- **Schedules**: a Hetzner host crontab calls `/api/cron/run-schedules`
  every 15 minutes with a shared `CRON_SECRET` header. The route is
  idempotent via `@@unique([scheduleId, scheduledForDate])` on Task.
  Client-side catch-up runs the same logic on app boot.
