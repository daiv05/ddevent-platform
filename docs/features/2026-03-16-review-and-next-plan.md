# 2026-03-16 - Review by Parts and Continuation Plan

## Goal and Scope
- Goal: audit current implementation status by module and define the next implementation plan aligned with AGENTS and skills docs.
- In scope: API, worker, data model, infra, dashboard, documentation alignment.
- Out of scope: immediate code fixes in this item.

## Review Summary by Parts
- API ingestion path exists and follows validate -> store -> queue pattern.
- Worker has event/workflow/analytics/webhook consumers with idempotency table usage.
- Infra local stack exists and compose validates.
- Dashboard remains in scaffold state and does not match feature expectations in SKILL_FRONTEND.
- AGENTS current status section is outdated relative to implemented phases.

## Continuation Plan

### Phase A - Critical Corrections (P0)
1. Align workflow condition path semantics with stored payload shape (avoid `data.*` mismatch).
2. Add workflow cache in Redis for rules (`tenant:{tenantId}:workflows:{eventName}`) per SKILL_WORKFLOWS.
3. Harden API key format validation to strict `pk_live_` / `pk_test_` prefixes.
4. Add webhook request timeout and retry observability tests.

### Phase B - Reliability and Contracts (P1)
1. Add integration tests for end-to-end flow: API -> queue -> worker -> workflow/webhook.
2. Add worker tests for idempotency under duplicate deliveries.
3. Add structured error envelope and centralized Fastify error handler.
4. Add pagination/filtering read endpoint for events (`GET /v1/events`) to support dashboard phase.

### Phase C - Data and Operations (P1)
1. Create first Prisma migration artifacts from current schema and lock baseline.
2. Add seed safety flags for local/dev consistency.
3. Add health/readiness checks for API and worker dependencies.
4. Optimize compose startup to avoid runtime `npm install` on each container boot.

### Phase D - Frontend Buildout (P2)
1. Replace dashboard boilerplate home.
2. Add required dependencies from SKILL_FRONTEND (TanStack Query, Redux Toolkit, Zod, react-hook-form, shadcn/ui).
3. Implement base route groups `(auth)` and `(dashboard)`.
4. Implement MVP pages: events list, event detail, API keys settings.

### Phase E - Documentation and Governance (Ongoing)
1. Update AGENTS current status section to reflect implemented phases.
2. Keep one feature document per work item in `docs/features/`.
3. Attach validation evidence (commands/results) in each feature note.

## Status and Next Steps
- Status: planned
- Next execution order: A1 -> A2 -> A3 -> B1 -> C1 -> D1

## References
- AGENTS.md
- docs/event-handling.md
- .agents/skills/SKILL_EVENT_INGESTION.md
- .agents/skills/SKILL_WORKER_SYSTEM.md
- .agents/skills/SKILL_WORKFLOWS.md
- .agents/skills/SKILL_FRONTEND.md
