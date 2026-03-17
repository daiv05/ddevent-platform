# 2026-03-16 - Phase 3 Worker System

## Goal and Scope
- Goal: Implement worker processing for asynchronous event handling with idempotency and queue fan-out.
- In scope: `apps/worker` bootstrap, events/workflows/analytics workers, idempotency helper, queue connection reuse.
- Out of scope: webhook HTTP dispatcher worker, advanced analytics persistence in database.

## Design Decisions
- Worker service consumes BullMQ queues directly with explicit concurrency per queue.
- Added centralized idempotency helper for `event_processing` checks and marks.
- `process-event` fans out to `run-workflows` and `update-analytics` jobs.
- Analytics MVP uses Redis aggregation (`hincrby`) to avoid introducing a new DB table before schema/migration planning.

## Impacted Areas
- Apps:
  - `apps/worker`
- Packages:
  - `packages/queues` (exports `bullmqConnection`)
- Docs:
  - `docs/features/2026-03-16-phase3-worker-system.md`

## Contracts and Data Changes
- Queue consumers:
  - `events` -> `processEvent(eventId, tenantId)`
  - `workflows` -> `runWorkflows(eventId, tenantId, eventName)`
  - `analytics` -> `updateAnalytics(eventId, tenantId, eventName, date)`
- Queue producers used:
  - `workflowQueue.add('run-workflows', ...)`
  - `analyticsQueue.add('update-analytics', ...)`
  - `webhookQueue.add('dispatch-webhook', ...)` (from workflow actions)
- Schema/migrations:
  - No new schema changes in this phase.

## Security and Multitenancy Notes
- Every handler carries `tenantId` in payload and DB lookups.
- Redis analytics keys are tenant-scoped: `tenant:{tenantId}:analytics:{date}`.
- Workflow execution and idempotency records are written with `tenantId`.

## Observability Notes
- Added logs for:
  - `worker.started`
  - `worker.job_started`
  - `worker.job_failed`
  - `worker.event_dispatched`
  - `workflow.executed`
  - `analytics.updated`
- Added skip/missing logs for idempotent and missing-event scenarios.

## Validation and Testing
- Executed:
  - `npm install`
  - `turbo run check-types --filter=worker --ui=stream`
- Result:
  - Worker module type-check passed in current workspace.
- Pending:
  - Runtime integration test with live Redis/Postgres and seeded events.

## Status and Next Steps
- Status: done
- Open risks:
  - Webhook dispatcher queue is enqueued but no dedicated webhook worker is active yet.
  - Redis-based analytics is temporary and should be complemented with durable analytics tables.
- Next actions:
  - Add webhook consumer worker with retry/failure tracing.
  - Proceed to infrastructure phase (docker-compose + env setup) for full local E2E flow.

## References
- Related files:
  - `apps/worker/package.json`
  - `apps/worker/tsconfig.json`
  - `apps/worker/src/index.ts`
  - `apps/worker/src/handlers/idempotency.ts`
  - `apps/worker/src/handlers/processEvent.ts`
  - `apps/worker/src/handlers/runWorkflows.ts`
  - `apps/worker/src/handlers/updateAnalytics.ts`
  - `packages/queues/src/index.ts`
- Commits/PRs: pending
