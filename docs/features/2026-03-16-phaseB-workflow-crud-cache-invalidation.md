# 2026-03-16 - Phase B Workflow CRUD and Cache Invalidation

## Goal and Scope
- Goal: add workflow management endpoints and connect cache invalidation so workflow changes are reflected during worker execution.
- In scope: API routes for workflow CRUD and runs listing, cache invalidation utility in API, route registration.
- Out of scope: dashboard UI integration and workflow builder UX.

## Design Decisions
- Workflow routes are tenant-scoped through existing API auth hook context.
- Cache invalidation is executed on create/update/delete mutations by trigger event.
- Delete operation is soft-delete (`isActive = false`) as defined by workflow conventions.
- Runs endpoint is paginated with query validation.

## Impacted Areas
- Apps:
  - `apps/api/src/routes/workflows.ts`
  - `apps/api/src/lib/workflowCache.ts`
  - `apps/api/src/index.ts`
- Packages:
  - none
- Infra:
  - none

## Contracts and Data Changes
- Added endpoints:
  - `GET /v1/workflows`
  - `POST /v1/workflows`
  - `GET /v1/workflows/:id`
  - `PUT /v1/workflows/:id`
  - `DELETE /v1/workflows/:id`
  - `GET /v1/workflows/:id/runs?page=&pageSize=`
- Data model/migrations:
  - no schema change

## Security and Multitenancy Notes
- Every workflow query/mutation is scoped by `tenantId`.
- No cross-tenant workflow reads or mutations allowed.
- Cache keys include tenant namespace.

## Observability Notes
- Added logs:
  - `workflow.created`
  - `workflow.updated`
  - `workflow.disabled`

## Validation and Testing
- Executed:
  - type-check for API and worker after route integration
- Pending:
  - integration tests for create/update/delete + cache invalidation behavior

## Status and Next Steps
- Status: done
- Open risks:
  - workflow cache invalidation currently triggered only via API mutations; external DB writes would bypass it.
- Next actions:
  - add integration test suite for workflow lifecycle and worker cache behavior
  - add dashboard integration for workflow management pages

## References
- Related files:
  - `apps/api/src/routes/workflows.ts`
  - `apps/api/src/lib/workflowCache.ts`
  - `apps/api/src/index.ts`
- Commits/PRs: pending
