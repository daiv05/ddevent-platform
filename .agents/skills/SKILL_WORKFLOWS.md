# SKILL_WORKFLOWS.md — Workflow Engine

Use this skill when building the workflow engine in `apps/worker`, workflow management API endpoints in `apps/api`, or the shared workflow evaluation logic in `packages/workflows`.

---

## 1. Concept

A **workflow** is a rules-based automation:

```
WHEN event = "user_registered"
AND  data.plan = "pro"
THEN send_email(template: "welcome_pro")
     AND call_webhook(url: "https://crm.example.com/hook")
```

Workflows are entirely async. They **never** run in the API request path.

---

## 2. Key Packages Used

| Package | Import | Purpose |
|---|---|---|
| `@devent/workflows` | `evaluateWorkflows`, `WorkflowRule` | Rule evaluation logic |
| `@devent/database` | `db` | Prisma client |
| `@devent/queues` | `workflowQueue`, `webhookQueue`, `redis` | Enqueue actions |
| `@devent/events` | `StoredEvent` | Event type |
| `@devent/utils` | `logger` | Structured logging |

---

## 3. Shared Types & Logic (packages/workflows)

```typescript
// packages/workflows/src/index.ts
import type { EventPayload } from '@devent/events';

export type WorkflowCondition = {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';
  value: string;
};

export type WorkflowAction = {
  type: 'webhook' | 'send_email' | 'slack' | 'discord' | 'integration';
  [key: string]: unknown;
};

export type WorkflowRule = {
  id: string;
  tenantId: string;
  name: string;
  triggerEvent: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
};

export function matchesConditions(
  data: Record<string, unknown>,
  conditions: WorkflowCondition[]
): boolean {
  return conditions.every(condition => {
    const value = getNestedValue(data, condition.field);
    switch (condition.operator) {
      case 'eq':       return value === condition.value;
      case 'neq':      return value !== condition.value;
      case 'gt':       return Number(value) > Number(condition.value);
      case 'lt':       return Number(value) < Number(condition.value);
      case 'contains': return String(value).includes(String(condition.value));
      case 'exists':   return value !== undefined && value !== null;
      default:         return false;
    }
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    return acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined;
  }, obj);
}
```

---

## 4. Prisma Models (packages/database/prisma/schema.prisma)

```prisma
model Workflow {
  id           String   @id @default(cuid())
  tenantId     String
  name         String
  isActive     Boolean  @default(true)
  triggerEvent String
  conditions   Json     @default("[]")
  actions      Json     @default("[]")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  executions   WorkflowExecution[]

  @@index([tenantId, triggerEvent])
  @@map("workflows")
}

model WorkflowExecution {
  id          String   @id @default(cuid())
  tenantId    String
  workflowId  String
  eventId     String
  status      String   // 'success' | 'failed' | 'skipped'
  error       String?
  executedAt  DateTime @default(now())

  workflow    Workflow @relation(fields: [workflowId], references: [id])
  @@index([tenantId, workflowId])
  @@map("workflow_executions")
}
```

---

## 5. Redis Cache for Workflow Rules (Critical)

**Never** query the DB for rules on every event. Cache per tenant + event name:

```typescript
import { redis } from '@devent/queues';
import { db } from '@devent/database';
import type { WorkflowRule } from '@devent/workflows';

const CACHE_TTL = 300; // 5 minutes

export async function getCachedWorkflows(
  tenantId: string,
  eventName: string
): Promise<WorkflowRule[]> {
  const key = `tenant:${tenantId}:workflows:${eventName}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const rules = await db.workflow.findMany({
    where: { tenantId, triggerEvent: eventName, isActive: true },
  });

  await redis.setex(key, CACHE_TTL, JSON.stringify(rules));
  return rules as WorkflowRule[];
}

// Call this whenever a workflow is created/updated/deleted
export async function invalidateWorkflowCache(tenantId: string, eventName: string) {
  await redis.del(`tenant:${tenantId}:workflows:${eventName}`);
}
```

---

## 6. Workflow Worker (apps/worker)

```typescript
// apps/worker/src/handlers/runWorkflows.ts
import { Worker } from 'bullmq';
import { redis, webhookQueue } from '@devent/queues';
import { matchesConditions } from '@devent/workflows';
import { db } from '@devent/database';
import { logger } from '@devent/utils';
import { getCachedWorkflows } from '../cache/workflows';

export const workflowWorker = new Worker(
  'workflows',
  async (job) => {
    const { eventId, tenantId, eventName } = job.data;

    const event = await db.event.findUnique({ where: { id: eventId } });
    if (!event) return;

    const rules = await getCachedWorkflows(tenantId, eventName);

    for (const rule of rules) {
      const matched = matchesConditions(event.payload as Record<string, unknown>, rule.conditions);

      if (!matched) {
        logger.info({ msg: 'workflow.skipped', workflowId: rule.id, reason: 'conditions_not_met' });
        continue;
      }

      for (const action of rule.actions) {
        await dispatchAction(action, event, rule.id);
      }

      await db.workflowExecution.create({
        data: { tenantId, workflowId: rule.id, eventId, status: 'success' },
      });

      logger.info({ msg: 'workflow.executed', workflowId: rule.id, eventId });
    }
  },
  { connection: redis }
);

async function dispatchAction(action: any, event: any, workflowId: string) {
  switch (action.type) {
    case 'webhook':
      await webhookQueue.add('dispatch-webhook', {
        tenantId: event.tenantId,
        eventId: event.id,
        workflowId,
        url: action.url,
        payload: { event: event.eventName, data: event.payload },
      });
      break;
    // Additional action types: send_email, slack, discord...
  }
}
```

---

## 7. Workflow API Endpoints (apps/api)

```
GET    /workflows           → list active workflows for tenant
POST   /workflows           → create workflow (invalidates cache)
GET    /workflows/:id       → get single workflow
PUT    /workflows/:id       → update workflow (invalidates cache)
DELETE /workflows/:id       → soft-delete (isActive = false, invalidates cache)
GET    /workflows/:id/runs  → paginated WorkflowExecution log
```

All endpoints require API key auth and scope to `req.tenantId`.

On create/update/delete, always call `invalidateWorkflowCache(tenantId, triggerEvent)`.

---

## 8. Workflow Data Stored as JSON

Conditions and actions are stored as `JSON` in Postgres. Example stored workflow:

```json
{
  "id": "clxyz...",
  "tenantId": "tenant_123",
  "name": "Welcome Pro Users",
  "triggerEvent": "user_registered",
  "isActive": true,
  "conditions": [
    { "field": "data.plan", "operator": "eq", "value": "pro" }
  ],
  "actions": [
    { "type": "webhook", "url": "https://crm.example.com/hook" },
    { "type": "send_email", "template": "welcome_pro", "to": "{{data.email}}" }
  ]
}
```

---

## 9. Logging

```json
{ "msg": "workflow.evaluated",  "tenantId": "...", "eventId": "...", "matched": 2 }
{ "msg": "workflow.executed",   "workflowId": "...", "eventId": "..." }
{ "msg": "workflow.skipped",    "workflowId": "...", "reason": "conditions_not_met" }
{ "msg": "workflow.failed",     "workflowId": "...", "error": "..." }
```

---

## 10. What NOT to do

- ❌ Do NOT evaluate workflows in the API request path.
- ❌ Do NOT query DB for workflows on every event — use the Redis cache.
- ❌ Do NOT execute actions synchronously — fan out to queues.
- ❌ Do NOT allow cross-tenant workflow access.
- ❌ Do NOT define `matchesConditions` in `apps/worker` — it lives in `@devent/workflows`.
- ❌ Do NOT forget to call `invalidateWorkflowCache` on workflow mutations.
