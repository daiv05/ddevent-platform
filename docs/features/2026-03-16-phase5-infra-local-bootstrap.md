# 2026-03-16 - Phase 5 Infra Local Bootstrap

## Goal and Scope
- Goal: Provide a reproducible local runtime environment for API, worker, dashboard, Postgres, and Redis.
- In scope: Docker Compose stack, `.env.example` files, README operational guide.
- Out of scope: production deployment manifests, CI pipelines, Kubernetes.

## Design Decisions
- Use Docker Compose as local orchestrator with one service per runtime component.
- Keep infra simple and explicit: Postgres + Redis + API + worker + dashboard.
- Use Node image and workspace commands to avoid introducing Dockerfiles prematurely.
- Provide shared and app-specific env templates to standardize local setup.

## Impacted Areas
- Infra:
  - `infra/docker/docker-compose.yml`
- Environment docs:
  - `.env.example`
  - `apps/api/.env.example`
  - `apps/worker/.env.example`
  - `apps/dashboard/.env.example`
- Docs:
  - `README.md`

## Contracts and Data Changes
- Endpoints/contracts: none.
- Queue/job schema: none.
- Data model/migrations: none.

## Security and Multitenancy Notes
- Environment examples avoid real credentials and use local defaults only.
- Redis and database URLs are explicit and tenant-safe patterns remain in app code.
- API key usage remains server-side; dashboard env only exposes API base URL.

## Observability Notes
- Compose setup preserves service-level logs for API/worker.
- README includes checkpoints for smoke validation (`event.received`, `event.stored`, `event.queued`, `worker.job_started`).

## Validation and Testing
- Executed:
  - `turbo run check-types --filter=api --filter=worker --ui=stream`
- Pending:
  - Runtime smoke with `docker compose up` in host with Docker engine available.

## Status and Next Steps
- Status: done
- Open risks:
  - Compose currently installs dependencies on container startup, which is slower but simpler.
  - API smoke test still requires seeded valid API key hash.
- Next actions:
  - Add webhook consumer worker for `dispatch-webhook` queue.
  - Add migration/seed command flow to simplify local bootstrap.

## References
- Related files:
  - `infra/docker/docker-compose.yml`
  - `.env.example`
  - `apps/api/.env.example`
  - `apps/worker/.env.example`
  - `apps/dashboard/.env.example`
  - `README.md`
- Commits/PRs: pending
