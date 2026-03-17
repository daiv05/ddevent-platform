# Devent Platform 


> Experimental app for testing event-driven architecture patterns, monorepo structure, and local development workflows

Devent is a multitenant, event-driven platform to ingest, process, and distribute application events.

## Current status

- Phase 1: shared packages foundation completed.
- Phase 2: ingestion API (`POST /v1/events`) completed.
- Phase 3: base worker with idempotency and fan-out completed.
- Phase 5 (local infra): Docker bootstrap + environment variables available.

## Requirements

- Node.js >= 18
- npm >= 10
- Docker + Docker Compose

## Environment variables

Example files are included in:

- `.env.example`
- `apps/api/.env.example`
- `apps/worker/.env.example`
- `apps/dashboard/.env.example`

Relevant webhook variables in worker:

- `WEBHOOK_TIMEOUT_MS`: HTTP timeout per delivery attempt.
- `WEBHOOK_SIGNING_SECRET`: optional secret for `X-Devent-Signature` signing.

Relevant variable for server-side dashboard:

- `DEVENT_DASHBOARD_API_KEY`: API key used by the dashboard `/events` route to query the API.
- `DEVENT_API_URL_SERVER`: internal URL used by the dashboard on the server side (in Docker use `http://api:3001/v1`).

## Local infrastructure (Docker)

The compose file is located at `infra/docker/docker-compose.yml`.

Start the full stack:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Stop the stack:

```bash
docker compose -f infra/docker/docker-compose.yml down
```

Exposed services:

- Dashboard: `http://localhost:3000`
- API: `http://localhost:3001`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Local development without Docker

Install dependencies:

```bash
npm install
```

Start all workspaces in parallel with Turbo:

```bash
npm run dev
```

Start individual services:

```bash
npm run dev --workspace api
npm run dev --workspace worker
npm run dev --workspace dashboard
```

## Quality checks

Type checking:

```bash
npm run check-types
```

Build:

```bash
npm run build
```

## Event flow smoke test

1. Make sure API and worker are running.
2. Run local migration and seed:

```bash
npm run prisma:migrate --workspace @devent/database -- --name init
npm run prisma:seed --workspace @devent/database
```

3. Use the `apiKey` printed by the seed.
4. Send an event:

```bash
curl -X POST http://localhost:3001/v1/events \
	-H "Content-Type: application/json" \
	-H "Authorization: Bearer <apiKey_from_seed>" \
	-d '{"event":"user_registered","data":{"plan":"pro"}}'
```

5. Verify a `202` response with `eventId`.
6. Check API/worker logs for checkpoints:
	 - `event.received`
	 - `event.stored`
	 - `event.queued`
	 - `worker.job_started`

## Feature documentation

Each implemented feature must be documented in `docs/features/`.
Use `docs/features/TEMPLATE.md` as the base.
