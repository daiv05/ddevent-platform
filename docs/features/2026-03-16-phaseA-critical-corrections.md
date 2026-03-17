# 2026-03-16 - Phase A Critical Corrections

## Goal and Scope
- Goal: implement critical corrections identified in review for API auth and workflow execution reliability.
- In scope: strict API key prefix validation, health route auth bypass robustness, workflow cache in Redis, workflow condition context alignment, retry observability logs.
- Out of scope: workflow cache invalidation endpoints (depends on workflow CRUD API), frontend updates.

## Design Decisions
- API key validation now accepts only `pk_live_` and `pk_test_` prefixes.
- Healthcheck bypass uses route prefix check to avoid query/path variations.
- Workflow rules are read through Redis cache (`tenant:{tenantId}:workflows:{eventName}`) with TTL.
- Workflow condition evaluation uses context compatible with both flat fields and `data.*` fields.
- Worker failure logs include retry attempt metadata.

## Impacted Areas
- Apps:
  - `apps/api/src/hooks/auth.ts`
  - `apps/worker/src/handlers/runWorkflows.ts`
  - `apps/worker/src/index.ts`
  - `apps/worker/src/cache/workflows.ts`
- Packages:
  - none
- Infra:
  - none

## Contracts and Data Changes
- Endpoint/auth contract:
  - API keys with unsupported prefix are rejected as unauthorized.
- Workflow runtime contract:
  - condition paths now evaluate against context including both `data` and top-level payload fields.
- Data model/migrations:
  - none

## Security and Multitenancy Notes
- Tightened API key prefix gate in auth middleware.
- Workflow cache keys include tenant scoping.
- No tenant-crossing DB query introduced.

## Observability Notes
- Added `attempt` and `max_attempts` fields to worker failure logs.
- Existing checkpoints remain in place for API and worker pipeline.

## Validation and Testing
- Executed:
  - type diagnostics check for `apps/api` and `apps/worker`
- Result:
  - no editor-reported errors after changes
- Pending:
  - integration test to verify cache hit path and stale cache invalidation lifecycle

## Status and Next Steps
- Status: done
- Open risks:
  - workflow cache invalidation is not wired yet because workflow mutation endpoints are pending.
- Next actions:
  - implement workflow CRUD endpoints + cache invalidation calls
  - add integration tests for conditions using `data.*` and flat fields

## References
- Related files:
  - `apps/api/src/hooks/auth.ts`
  - `apps/worker/src/cache/workflows.ts`
  - `apps/worker/src/handlers/runWorkflows.ts`
  - `apps/worker/src/index.ts`
- Commits/PRs: pending
