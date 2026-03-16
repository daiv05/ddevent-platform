# AGENTS.md — Devent Platform

This file is the **primary guide for any AI agent** working on this codebase.
Read it **before touching any file**. The skills table in §4 tells you which document to read next.

---

## 1. What is Devent?

Devent is an **open-source, multitenant, event-driven SaaS platform** for ingestion, processing, and distribution of application events.

Think of it as a self-hostable alternative to Segment/Mixpanel — apps send events via SDK or REST API, and Devent handles storage, workflow automation, webhooks, analytics, and integrations.

**Architecture references (read before implementing features):**
- [`docs/devent-arquitecture.md`](./docs/devent-arquitecture.md) — Full system architecture overview
- [`docs/event-handling.md`](./docs/event-handling.md) — Efficient event handling patterns and performance rules

---

## 2. Tech Stack

| Layer | Technology | Location |
|---|---|---|
| **Monorepo tooling** | Turborepo 2, npm workspaces | root |
| **Dashboard (frontend)** | Next.js 16, TypeScript, Tailwind CSS v4, Zod, Redux Toolkit | `apps/dashboard` |
| **API service** | Node.js, TypeScript, **Fastify** | `apps/api` |
| **Worker service** | Node.js, TypeScript, BullMQ | `apps/worker` |
| **Database** | PostgreSQL + Prisma ORM | `packages/database` |
| **Queue** | Redis + BullMQ | `packages/queues` |
| **Cache** | Redis | shared via `packages/queues` |
| **Shared types** | TypeScript | `packages/events`, `packages/workflows` |
| **SDK** | TypeScript, publishable to npm | `packages/sdk` |
| **Utilities** | TypeScript | `packages/utils` |
| **Infra** | Docker Compose | `infra/docker` |

---

## 3. Monorepo Structure

```
ddevent-platform/
├── .agents/
│   └── skills/                 ← Agent skill documents
│       ├── SKILL_EVENT_INGESTION.md
│       ├── SKILL_WORKER_SYSTEM.md
│       ├── SKILL_MULTITENANT.md
│       ├── SKILL_WORKFLOWS.md
│       ├── SKILL_FRONTEND.md
│       └── SKILL_MONOREPO.md
|
├── apps/
│   ├── api/                    ← Core API service (Node.js + TypeScript)
│   ├── worker/                 ← Background worker service (BullMQ)
│   └── dashboard/              ← Next.js frontend (App Router)
│
├── packages/
│   ├── database/               ← Prisma schema + shared DB client
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       └── client.ts
│   ├── events/                 ← Shared event types (EventPayload, etc.)
│   │   └── src/index.ts
│   ├── workflows/              ← Shared workflow types & condition evaluation
│   │   └── src/index.ts
│   ├── queues/                 ← BullMQ queue instances (shared by api + worker)
│   │   └── src/index.ts
│   ├── sdk/                    ← Client SDK (publishable npm package)
│   │   └── src/index.ts
│   └── utils/                  ← Shared utilities (logging, errors, validation)
│       └── src/index.ts
│
├── infra/
│   └── docker/
│       └── docker-compose.yml  ← postgres, redis, api, worker, dashboard
│
├── docs/
│   ├── devent-arquitecture.md  ← System architecture reference
│   └── event-handling.md       ← Event handling performance reference
│
├── turbo.json                  ← Turborepo task pipeline
├── package.json                ← Root workspace (npm workspaces)
└── AGENTS.md                   ← You are here
```

---

## 4. Domain Skills

Read the relevant skill document **before** implementing any feature:

| Domain | Skill File | When to use |
|---|---|---|
| Monorepo & shared packages | [`SKILL_MONOREPO.md`](./.agents/skills/SKILL_MONOREPO.md) | Adding packages, dependencies, Turbo tasks |
| Event Ingestion Pipeline | [`SKILL_EVENT_INGESTION.md`](./.agents/skills/SKILL_EVENT_INGESTION.md) | Building `POST /events`, SDK, validation |
| Worker & Queue System | [`SKILL_WORKER_SYSTEM.md`](./.agents/skills/SKILL_WORKER_SYSTEM.md) | BullMQ workers, job types, retry logic |
| Multitenancy | [`SKILL_MULTITENANT.md`](./.agents/skills/SKILL_MULTITENANT.md) | Tenant isolation, API keys, rate limits |
| Workflow Engine | [`SKILL_WORKFLOWS.md`](./.agents/skills/SKILL_WORKFLOWS.md) | Workflow rules, actions, trigger system |
| Frontend / UI | [`SKILL_FRONTEND.md`](./.agents/skills/SKILL_FRONTEND.md) | Next.js pages, components, data fetching |

---

## 5. Shared Package Dependency Map

Understanding which package depends on which is critical to avoid circular deps:

```
packages/utils          ← no internal deps (leaf)
packages/events         ← no internal deps (leaf)
packages/workflows      ← depends on: events
packages/database       ← depends on: utils
packages/queues         ← depends on: events, utils

apps/api                ← depends on: database, events, queues, workflows, utils
apps/worker             ← depends on: database, events, queues, workflows, utils
apps/dashboard          ← depends on: events (types only), utils
packages/sdk            ← no internal deps (standalone, publishable)
```

**Rule:** Packages must never import from `apps/`. Only `apps/` import from `packages/`.

---

## 6. Core Design Principles

Non-negotiable. Apply them in every implementation:

### 6.1 API is thin — workers are heavy
The API does exactly 3 things per event: **validate → store → enqueue**.
No heavy computation happens in the HTTP request path. See [`event-handling.md §2`](./docs/event-handling.md).

### 6.2 Event store is append-only
The `events` table is **never updated**. Events are immutable records.
Use `INSERT` only — never `UPDATE` on event rows.

### 6.3 Tenant isolation everywhere
Every query, every BullMQ job, every Redis cache key **must include `tenant_id`**.
Never expose data across tenants. See [`SKILL_MULTITENANT.md`](./.agents/skills/SKILL_MULTITENANT.md).

### 6.4 Idempotent workers
Workers must check the `event_processing` table before acting.
An event may be delivered more than once — always guard against double processing.

### 6.5 Async everything
Webhooks, integrations, analytics, workflow execution — all async via BullMQ queues.
Nothing slow runs inline in the API.

### 6.6 Shared code lives in packages
Any type, function, or constant used by more than one app goes into a `packages/` package.
Do not copy-paste shared logic across apps.

### 6.7 One Prisma client, one schema
All DB access goes through `packages/database`. No app defines its own Prisma client or schema.

---

## 7. Development Phases (Roadmap)

| Phase | Focus | Key Features |
|---|---|---|
| **Phase 1 — MVP** | Core pipeline | Event ingestion, event store, webhooks |
| **Phase 2 — Automation** | Logic layer | Workflows, queue processing, integrations |
| **Phase 3 — Analytics** | Observability | Dashboards, aggregations, metrics |

> **Current status:** Turborepo scaffold created. `apps/dashboard` has a working Next.js shell. `apps/api` and `apps/worker` are empty shells. All `packages/` are empty and need to be built out starting Phase 1.

---

## 8. Security Rules

- Every API endpoint requires an **API key** validated against the tenant's project (`pk_live_*` or `pk_test_*`).
- Apply **rate limiting per tenant** using Redis before processing any event.
- Validate payload schema before storing. Reject malformed events with `400`.
- Never leak `tenant_id` or internal IDs in client-facing error messages.
- Never log raw API keys.

---

## 9. Observability Conventions

Use structured logging with these standard fields on every log entry:

```json
{
  "level": "info|warn|error",
  "service": "api|worker|dashboard",
  "tenant_id": "...",
  "event_name": "...",
  "event_id": "...",
  "msg": "..."
}
```

Key log checkpoints:
- `event.received` — on API ingestion
- `event.stored` — after DB write
- `event.queued` — after Redis push
- `workflow.executed` — after rule runs
- `webhook.sent` — after HTTP dispatch
- `webhook.failed` + retry info — on failure

Shared logger should live in **`packages/utils`** and be imported by all apps.

---

## 10. Database Conventions

- All tables must have `tenant_id UUID NOT NULL` as first non-PK column.
- Always index `(tenant_id, created_at)` and `(tenant_id, event_name)` on event tables.
- Use `TIMESTAMPTZ` (not `TIMESTAMP`) for all time columns.
- Use `JSONB` for event payloads.
- Prisma schema lives in `packages/database/prisma/schema.prisma`.
- Run migrations from `packages/database`: `npx prisma migrate dev`.

---

## 11. What NOT to do

- ❌ Do NOT process workflows synchronously in the API request.
- ❌ Do NOT send webhooks from the API handler.
- ❌ Do NOT run analytics aggregations inline.
- ❌ Do NOT skip `tenant_id` on any DB query.
- ❌ Do NOT update or delete rows in the `events` table.
- ❌ Do NOT hardcode tenant credentials or API keys in source code.
- ❌ Do NOT define a Prisma client or schema outside of `packages/database`.
- ❌ Do NOT import from `apps/` inside `packages/`.
- ❌ Do NOT duplicate shared types between apps — use `packages/events` or `packages/workflows`.

---

## 12. Continuous Feature Documentation (Mandatory)

Every feature worked on in this repository must be documented during the same work cycle.
Do not consider a feature complete without an updated documentation entry.

### 12.1 Required location

- Store feature notes under `docs/features/`.
- One file per feature/work item.
- Use kebab-case names with date prefix, for example: `2026-03-16-event-ingestion-mvp.md`.

### 12.2 Minimum required content per feature

Each feature document must include at least:

- Goal and scope
- Technical decisions and rationale
- Affected endpoints/contracts/events/queues
- Data model or migration impact
- Security and multitenancy considerations
- Observability updates (logs/metrics/checkpoints)
- Current status (`planned`, `in-progress`, `done`, `blocked`)
- Links to related commits/PRs/files

### 12.3 Definition of Done extension

A task is considered done only when:

1. Code is implemented
2. Validation/tests for that scope are executed (or explicitly noted if pending)
3. Documentation is updated in `docs/features/` with the minimum required content

### 12.4 Forbidden behavior

- ❌ Do NOT merge or close feature work without documentation.
- ❌ Do NOT ship behavior changes that are not reflected in docs.
- ❌ Do NOT leave undocumented schema/queue/contract changes.
