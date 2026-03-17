# 2026-03-16 - Phase 2 API Ingestion Bootstrap

## Goal and Scope
- Goal: Implement the API ingestion slice for Phase 2 with auth, tenant scoping, rate limiting, and event enqueueing.
- In scope: `apps/api` bootstrap, auth pre-handler, `POST /v1/events`, health endpoint, type-check validation.
- Out of scope: worker consumers, webhook dispatch execution, workflow CRUD.

## Design Decisions
- Fastify service initialized as thin ingestion layer.
- Global auth/rate-limit pre-handler added, with explicit `/health` bypass.
- API stores events and enqueues `process-event` jobs only (no heavy inline work).
- Request tenant context attached to `FastifyRequest` via type augmentation.

## Impacted Areas
- Apps:
  - `apps/api`
- Packages consumed:
  - `@devent/database`
  - `@devent/queues`
  - `@devent/utils`
- Docs:
  - `docs/features/*`

## Contracts and Data Changes
- Endpoints:
  - `GET /health`
  - `POST /v1/events`
- Event/job payloads:
  - Queue job `process-event`: `{ eventId, tenantId }`
- Schema/migrations:
  - No new migration executed in this step (schema already scaffolded in previous phase).
- Backward compatibility:
  - No existing API contract was broken (new service scaffold).

## Security and Multitenancy Notes
- API key format validation based on `Bearer pk_*` style and hash comparison with bcrypt.
- Tenant context resolved from `api_keys` relation and propagated to request.
- Redis rate limiting per tenant with key format `rate:{tenantId}`.
- API key raw value is never logged.

## Observability Notes
- Added checkpoints:
  - `event.received`
  - `event.stored`
  - `event.queued`
  - `api.started`
- Structured fields include service, tenant_id, event_id, and event_name where applicable.

## Validation and Testing
- Executed:
  - `npm install`
  - `turbo run check-types --filter=api --ui=stream`
- Result:
  - API module type-check passes in current workspace state.
- Pending:
  - Integration test against real Postgres/Redis containers.
  - Runtime smoke test with seeded API key.

## Status and Next Steps
- Status: done
- Open risks:
  - `apps/api` currently uses tsconfig path mapping to resolve internal packages at type-check time.
  - End-to-end behavior still depends on pending infrastructure and worker setup.
- Next actions:
  - Phase 3: implement `apps/worker` consumers with idempotency guard and fan-out.
  - Add docker-compose and environment bootstrap for E2E local flow.

## References
- Related files:
  - `apps/api/package.json`
  - `apps/api/tsconfig.json`
  - `apps/api/src/index.ts`
  - `apps/api/src/hooks/auth.ts`
  - `apps/api/src/routes/events.ts`
  - `apps/api/src/types/fastify.d.ts`
- Commits/PRs: pending
