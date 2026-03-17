# 2026-03-17 - Phase C events read, hardening and dashboard first cut

## Goal and Scope
- Goal: execute ordered continuation tasks: event read API, stricter workflow action validation, worker resilience hardening, and first functional dashboard events view.
- In scope: API event listing/detail, workflow validation and execution guardrails, cache parse hardening, worker graceful shutdown, dashboard pages and env wiring.
- Out of scope: full frontend architecture with TanStack Query/Redux, end-to-end automated tests.

## Design Decisions
- Added read endpoints for events with tenant scope, pagination and filters.
- Enforced webhook action URL requirement at API validation layer.
- Prevented false workflow success when no supported actions are dispatched.
- Added cache corruption fallback (invalid JSON cache is deleted and repopulated).
- Added worker graceful shutdown for SIGINT/SIGTERM to close workers and shared connections.
- Implemented server-side dashboard events page using API + server env key for first operational cut.

## Impacted Areas
- API:
  - `apps/api/src/routes/events.ts`
  - `apps/api/src/routes/workflows.ts`
- Worker:
  - `apps/worker/src/handlers/runWorkflows.ts`
  - `apps/worker/src/cache/workflows.ts`
  - `apps/worker/src/index.ts`
- Dashboard:
  - `apps/dashboard/app/page.tsx`
  - `apps/dashboard/app/events/page.tsx`
  - `apps/dashboard/.env.example`
- Infra/env/docs:
  - `.env.example`
  - `infra/docker/docker-compose.yml`
  - `README.md`

## Contracts and Data Changes
- Added API endpoints:
  - `GET /v1/events`
  - `GET /v1/events/:id`
- Existing workflow endpoints now reject webhook actions without valid URL.
- No schema migration required.

## Security and Multitenancy Notes
- Event read endpoints are tenant-scoped using auth context.
- Workflow and runs operations remain tenant-scoped.
- Dashboard event read requires explicit server env key and does not expose key via public env.

## Observability Notes
- Existing worker failure logs already carry attempt metadata.
- Added workflow skip logging path for unsupported action sets.
- Added shutdown start/completion logs in worker.

## Validation and Testing
- Executed:
  - type-check for `api`, `worker`, and `dashboard`
- Result:
  - successful type checks with no reported errors.
- Pending:
  - integration tests for workflow validation and cache invalidation lifecycle.
  - UI smoke test using real seeded API key in dashboard env.

## Status and Next Steps
- Status: done
- Open risks:
  - dashboard is still first cut; lacks auth/session and filtering UX.
  - no automated integration tests yet.
- Next actions:
  - add integration tests for event read + workflow mutation effects.
  - implement dashboard filters and event detail navigation.

## References
- Related files:
  - `apps/api/src/routes/events.ts`
  - `apps/api/src/routes/workflows.ts`
  - `apps/worker/src/handlers/runWorkflows.ts`
  - `apps/worker/src/cache/workflows.ts`
  - `apps/worker/src/index.ts`
  - `apps/dashboard/app/events/page.tsx`
  - `infra/docker/docker-compose.yml`
  - `README.md`
- Commits/PRs: pending
