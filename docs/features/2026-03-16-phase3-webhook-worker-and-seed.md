# 2026-03-16 - Phase 3 Extension: Webhook Worker and Local Seed

## Goal and Scope
- Goal: Complete async webhook processing path and reduce friction for local smoke testing.
- In scope: webhook consumer in worker, idempotent webhook dispatch, Prisma seed script for tenant/project/api key, README smoke test update.
- Out of scope: durable analytics table migration, advanced webhook signature/auth.

## Design Decisions
- Added dedicated `webhooks` queue consumer in worker entrypoint.
- Implemented idempotency for webhook dispatch using composed worker type (`webhook-dispatch:{workflowId}:{url}`).
- Seed script upserts tenant/project and creates active API key hash, disabling previous active keys per project.
- README smoke flow now uses migration + seed instead of manual DB edits.

## Impacted Areas
- Apps:
  - `apps/worker/src/index.ts`
  - `apps/worker/src/handlers/dispatchWebhook.ts`
- Packages:
  - `packages/database/package.json`
  - `packages/database/prisma/seed.ts`
- Docs:
  - `README.md`

## Contracts and Data Changes
- Queue consumer added:
  - `webhooks` -> `dispatchWebhook`
- Job payload handled:
  - `{ eventId, tenantId, workflowId, url, payload }`
- Schema/migrations:
  - no migration generated in this extension.
  - fixed inverse relation in Prisma schema (`Tenant.executions`) to satisfy `WorkflowExecution.tenant` relation.

## Security and Multitenancy Notes
- Webhook dispatch logs include tenant and workflow context without exposing API keys.
- Seed stores only API key hash in DB and prints raw key once for local developer usage.
- All webhook idempotency keys remain tenant-scoped via event and workflow context.

## Observability Notes
- Added webhook checkpoints in worker logs:
  - `webhook.sent`
  - `webhook.failed`
  - `webhook.skipped`

## Validation and Testing
- Planned checks after implementation:
  - `npm install`
  - `turbo run check-types --filter=worker --filter=@devent/database --ui=stream`
- Runtime smoke pending Docker stack + seeded DB.

## Status and Next Steps
- Status: done
- Open risks:
  - webhook dispatch currently uses plain POST without signed payload.
  - retry behavior depends on BullMQ attempts from producer side.
- Next actions:
  - add webhook signature support and timeout policy.
  - add integration test that verifies retry and idempotency behavior.

## References
- Related files:
  - `apps/worker/src/handlers/dispatchWebhook.ts`
  - `apps/worker/src/index.ts`
  - `packages/database/prisma/seed.ts`
  - `packages/database/prisma/schema.prisma`
  - `packages/database/package.json`
  - `README.md`
- Commits/PRs: pending
