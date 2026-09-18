# Documentation — will be filled as the CRM is hardened (T1+)

This is **املاک ساج** — a Next.js CRM / property-filing system for a real-estate agency (Bushehr).

## Stack

- Next.js (App Router) + React + Tailwind
- PostgreSQL + Prisma
- JWT cookie auth (`saj_token`), roles: `OWNER` | `AGENT`

## Setup

1. Copy env and set secrets:

```bash
# required
JWT_SECRET=<long-random>
SEED_PASSWORD=<min-8-chars for demo users>   # only for local seed
POSTGRES_PASSWORD=<db password>
```

`POSTGRES_*` and `DATABASE_URL` must use the **same** user/password/db name (see `docker-compose.yml`).

2. Start database:

```bash
docker compose up -d db
```

3. Install, migrate, seed (CLI):

```bash
npm install
npx prisma migrate deploy   # or migrate dev
node prisma/seed.mjs        # requires SEED_PASSWORD
npm run dev
```

## Demo seed API (`/api/seed`) — locked

- Disabled when `NODE_ENV=production` or `SEED_ENABLED` is not `true`.
- Requires an **OWNER** session.
- Does **not** wipe customers unless you pass `wipe=true`.
- Never creates users with a non-bcrypt password hash.
- If no OWNER exists, set `SEED_OWNER_PHONE` + `SEED_OWNER_PASSWORD` (min 8 chars).

**Do not enable `SEED_ENABLED` in production.**

## Data integrity

- `Customer.phone` is **unique** — API returns 409 with `existingId` on clash.
- `PropertyAccess` is unique per `(propertyId, userId)` — re-grant upserts the same row.
- `Property.type` / `preferredType` stay **strings** so owners can add types in Settings (DB enum would freeze them).
- Before unique constraints, run `prisma/dedupe-before-unique.sql` if migrating an old database.

## Security notes

- Rotate `JWT_SECRET` for any real deployment.
- Never commit real `.env` values to a shared remote.
- Logout increments `tokenVersion` so outstanding JWTs become invalid.
- JWT signing/verification uses **jose only** (`src/lib/jwt.ts`); edge middleware must not import Prisma.

