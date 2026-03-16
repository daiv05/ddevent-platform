# SKILL_EVENT_INGESTION.md — Event Ingestion Pipeline

Use this skill when building the `POST /events` endpoint in `apps/api` (**Fastify**), the SDK (`packages/sdk`), or any part of the event ingestion path.

---

## 1. Responsibility

The ingestion service is the **entry point** for all events. It is intentionally thin:

1. Validate API key → resolve tenant  
2. Validate event schema  
3. Store event (append-only INSERT via `packages/database`)  
4. Push job to Redis queue (via `packages/queues`)  
5. Return `202 Accepted`

**Nothing else happens here.** No workflow evaluation, no webhook calls, no analytics.

---

## 2. Key Packages Used

| Package | Import | Purpose |
|---|---|---|
| `@devent/events` | `EventPayload` | Canonical event type |
| `@devent/database` | `db` | Prisma client |
| `@devent/queues` | `eventQueue` | BullMQ queue to enqueue jobs |
| `@devent/utils` | `logger`, `ValidationError` | Logging + errors |

---

## 3. API Endpoint

```
POST /events
Authorization: Bearer pk_live_<token>
Content-Type: application/json

{
  "event": "user_registered",
  "data": {
    "userId": "123",
    "plan": "pro"
  }
}
```

### Response

```json
// Success
HTTP 202 Accepted
{ "eventId": "evt_abc123" }

// Bad schema
HTTP 400 Bad Request
{ "error": "Invalid event payload" }

// Bad API key
HTTP 401 Unauthorized

// Rate limited
HTTP 429 Too Many Requests
```

---

## 4. Shared Event Type (from @devent/events)

```typescript
// packages/events/src/index.ts
export type EventPayload = {
  event: string
  tenantId: string
  data: Record<string, unknown>
  timestamp?: string   // ISO 8601; defaults to NOW() if omitted
  source?: string      // 'sdk' | 'api' | 'batch'
}

export type StoredEvent = EventPayload & {
  id: string
  createdAt: string
}
```

Import this in `apps/api` and `apps/worker` — **never redefine locally**.

---

## 5. Validation Rules

1. **API Key** — must be a valid `pk_live_*` or `pk_test_*` key tied to an active project.
2. **event** — required, non-empty string. Max 100 chars. Letters, numbers, underscores only.
3. **data** — must be a valid JSON object. Max size: 64 KB.
4. **timestamp** — optional ISO 8601 string; if absent, default to `NOW()`.

Reject any event that fails these checks with HTTP `400`.

---

## 6. API Handler Pattern (apps/api — Fastify)

```typescript
import Fastify from 'fastify';
import { z } from 'zod';
import { db } from '@devent/database';
import { eventQueue } from '@devent/queues';
import { logger } from '@devent/utils';

const IncomingEventSchema = z.object({
  event:     z.string().min(1).max(100),
  data:      z.record(z.unknown()).default({}),
  timestamp: z.string().datetime().optional(),
  source:    z.enum(['sdk', 'api', 'batch']).default('api'),
});

export async function registerEventsRoutes(fastify: typeof Fastify) {
  fastify.post('/events', async (request, reply) => {
    const tenant = request.tenant; // set by preHandler validateApiKey hook

    // 1. Validate
    const body = IncomingEventSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }
    const { event, data, timestamp, source } = body.data;

    // 2. Store (append-only)
    const stored = await db.event.create({
      data: {
        tenantId:  tenant.id,
        eventName: event,
        source,
        payload:   data,
        createdAt: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    logger.info({ msg: 'event.stored', eventId: stored.id, tenantId: tenant.id });

    // 3. Enqueue
    await eventQueue.add('process-event', {
      eventId:  stored.id,
      tenantId: tenant.id,
    });

    logger.info({ msg: 'event.queued', eventId: stored.id });

    return reply.status(202).send({ eventId: stored.id });
  });
}
```

---

## 7. Prisma Schema (packages/database/prisma/schema.prisma)

```prisma
model Event {
  id        String   @id @default(cuid())
  tenantId  String
  eventName String
  source    String   @default("api")
  payload   Json
  createdAt DateTime @default(now())

  tenant    Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId, createdAt])
  @@index([tenantId, eventName])
  @@map("events")
}
```

**⚠️ Never update or delete from `events`.** This model is append-only.

---

## 8. Rate Limiting (before DB write)

Apply rate limiting via Redis **before** any DB interaction:

```typescript
import { redis } from '@devent/queues'; // re-exported from packages/queues

const RATE_LIMITS: Record<string, number> = {
  free: 100,     // per minute
  pro: 10_000,
};

async function checkRateLimit(tenantId: string, plan: string) {
  const key = `rate:${tenantId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  const limit = RATE_LIMITS[plan] ?? 100;
  if (count > limit) throw new RateLimitError(`Rate limit exceeded for tenant ${tenantId}`);
}
```

---

## 9. SDK Design (packages/sdk)

```typescript
// packages/sdk/src/index.ts
export class DeventClient {
  constructor(private options: { apiKey: string; baseUrl?: string }) {}

  async track(event: string, data: Record<string, unknown> = {}): Promise<void> {
    await fetch(`${this.options.baseUrl ?? 'https://api.devent.io'}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  }
}
```

SDK is standalone — no `@devent/` internal imports. It can be published to npm.

---

## 10. Batch Endpoint

```
POST /events/batch
[ { "event": "page_view", "data": { "path": "/home" } }, ... ]
```

Use a single Prisma `createMany` for the batch, then enqueue one job per event.

---

## 11. Logging Checkpoints

```json
{ "msg": "event.received", "tenantId": "...", "eventName": "user_registered" }
{ "msg": "event.stored",   "eventId": "evt_123" }
{ "msg": "event.queued",   "eventId": "evt_123" }
```

---

## 12. What NOT to do

- ❌ Do NOT run workflow logic inside `POST /events`.
- ❌ Do NOT send webhooks from the ingestion handler.
- ❌ Do NOT create a local Prisma client — import `db` from `@devent/database`.
- ❌ Do NOT instantiate a new BullMQ Queue in `apps/api` — use `@devent/queues`.
- ❌ Do NOT store the raw API key in any log or DB column.
