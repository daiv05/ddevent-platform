# SKILL_WORKER_SYSTEM.md — Worker & Queue System

Use this skill when building any BullMQ worker in `apps/worker`, defining job types, or configuring the shared queue in `packages/queues`.

---

## 1. Overview

All heavy processing is **offloaded to `apps/worker`**. Workers are separate Node.js processes that consume jobs from Redis queues via BullMQ.

```
apps/api (thin) → packages/queues → apps/worker (heavy)
```

Workers are the **only** place where workflows run, webhooks are dispatched, analytics are aggregated, and integrations are triggered.

---

## 2. Key Packages Used

| Package | Import | Purpose |
|---|---|---|
| `@devent/queues` | `eventQueue`, `workflowQueue`, etc. | BullMQ queue instances |
| `@devent/database` | `db` | Prisma client |
| `@devent/events` | `StoredEvent` | Event type |
| `@devent/workflows` | `evaluateWorkflows` | Rule evaluation |
| `@devent/utils` | `logger` | Structured logging |

---

## 3. Shared Queue Definitions (packages/queues)

```typescript
// packages/queues/src/index.ts
import { Queue } from 'bullmq';
import { redis } from './redis';

export const eventQueue     = new Queue('events',      { connection: redis });
export const workflowQueue  = new Queue('workflows',   { connection: redis });
export const webhookQueue   = new Queue('webhooks',    { connection: redis });
export const analyticsQueue = new Queue('analytics',   { connection: redis });
export const cleanupQueue   = new Queue('cleanup',     { connection: redis });

export { redis }; // re-export for rate limiting in apps/api
```

`apps/api` imports queues to **enqueue**. `apps/worker` imports queues to **consume**.
**Never instantiate `new Queue()` inside apps** — always use `@devent/queues`.

---

## 4. Worker Types

| Worker | Queue | Responsibility |
|---|---|---|
| `workflow-worker` | `workflows` | Evaluate and execute workflow rules |
| `webhook-worker` | `webhooks` | Dispatch HTTP webhook requests |
| `analytics-worker` | `analytics` | Aggregate events into metrics tables |
| `integration-worker` | `integrations` | Send data to Slack, Discord, email, etc. |
| `cleanup-worker` | `cleanup` | Delete old events per tenant retention policy |

---

## 5. Worker Entry Point Pattern (apps/worker)

```typescript
// apps/worker/src/index.ts
import { Worker } from 'bullmq';
import { redis } from '@devent/queues';
import { logger } from '@devent/utils';
import { processEvent } from './handlers/processEvent';

const eventWorker = new Worker(
  'events',
  async (job) => {
    const { eventId, tenantId } = job.data;
    await processEvent(eventId, tenantId);
  },
  {
    connection: redis,
    concurrency: 20,
  }
);

eventWorker.on('failed', (job, err) => {
  logger.error({ msg: 'worker.job_failed', job: job?.name, err: err.message });
});

logger.info({ msg: 'worker.started', queue: 'events' });
```

---

## 6. Job Definitions

### process-event (primary dispatch job)

```typescript
interface ProcessEventJob {
  eventId: string;
  tenantId: string;
}
```

### run-workflows

```typescript
interface RunWorkflowsJob {
  eventId: string;
  tenantId: string;
  eventName: string;
}
```

### dispatch-webhook

```typescript
interface DispatchWebhookJob {
  eventId: string;
  tenantId: string;
  webhookId: string;
  url: string;
  payload: Record<string, unknown>;
}
```

### update-analytics

```typescript
interface UpdateAnalyticsJob {
  tenantId: string;
  eventName: string;
  date: string; // ISO: "2026-03-16"
}
```

---

## 7. Fan-out Pattern (processEvent handler)

```typescript
// apps/worker/src/handlers/processEvent.ts
import { db } from '@devent/database';
import { workflowQueue, analyticsQueue } from '@devent/queues';

export async function processEvent(eventId: string, tenantId: string) {
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return; // guard

  await Promise.all([
    workflowQueue.add('run-workflows', {
      eventId: event.id,
      tenantId: event.tenantId,
      eventName: event.eventName,
    }),
    analyticsQueue.add('update-analytics', {
      tenantId: event.tenantId,
      eventName: event.eventName,
      date: event.createdAt.toISOString().slice(0, 10),
    }),
  ]);
}
```

---

## 8. Idempotency Guard

Workers must check if an event was already processed before acting:

```typescript
import { db } from '@devent/database';

async function isAlreadyProcessed(eventId: string, workerType: string): Promise<boolean> {
  const record = await db.eventProcessing.findUnique({
    where: { eventId_workerType: { eventId, workerType } },
  });
  return !!record;
}

async function markProcessed(eventId: string, tenantId: string, workerType: string) {
  await db.eventProcessing.create({
    data: { eventId, tenantId, workerType },
  });
}
```

Prisma model:

```prisma
model EventProcessing {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  workerType  String
  processedAt DateTime @default(now())

  @@unique([eventId, workerType])
  @@map("event_processing")
}
```

---

## 9. Retry Strategy

```typescript
await webhookQueue.add('dispatch-webhook', payload, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 60_000, // 1 min initial
  },
});
```

Retry schedule: immediate → 1 min → ~5 min → ~30 min → ~2 hrs.

---

## 10. Batch Processing (Analytics Worker)

```typescript
// Process events in batches for analytics — never one by one
const analyticsWorker = new Worker('analytics', async (job) => {
  const { tenantId, eventName, date } = job.data;
  await db.$executeRaw`
    INSERT INTO daily_event_counts (tenant_id, event_name, date, count)
    VALUES (${tenantId}, ${eventName}, ${date}::date, 1)
    ON CONFLICT (tenant_id, event_name, date) DO UPDATE
    SET count = daily_event_counts.count + 1
  `;
}, { connection: redis, concurrency: 50 });
```

---

## 11. Logging Checkpoints

```json
{ "msg": "worker.job_started",  "queue": "workflows", "jobId": "..." }
{ "msg": "workflow.executed",   "eventId": "...", "workflowId": "..." }
{ "msg": "webhook.sent",        "eventId": "...", "url": "https://..." }
{ "msg": "webhook.failed",      "eventId": "...", "attempt": 2, "err": "..." }
{ "msg": "worker.job_done",     "queue": "analytics", "durationMs": 42 }
```

---

## 12. What NOT to do

- ❌ Do NOT instantiate `new Queue()` inside `apps/worker` — use `@devent/queues`.
- ❌ Do NOT instantiate `new PrismaClient()` inside `apps/worker` — use `@devent/database`.
- ❌ Do NOT skip the idempotency check.
- ❌ Do NOT process webhook HTTP calls inline in the API.
- ❌ Do NOT swallow errors silently — always log with full context.
- ❌ Do NOT block workers with synchronous I/O.
