# SKILL_MULTITENANT.md — Multitenancy Patterns

Use this skill when building any feature that involves tenant isolation, API key validation, rate limiting, or data access scoping. All DB access happens via `@devent/database`, rate limiting via Redis from `@devent/queues`.

---

## 1. Data Model

Devent uses a **shared database with tenantId column** model.

Every table must have `tenantId String` as the first non-PK field in the Prisma schema. Every query must filter by it.

### Core Prisma Models (packages/database/prisma/schema.prisma)

```prisma
model Tenant {
  id        String    @id @default(cuid())
  slug      String    @unique
  name      String
  plan      String    @default("free")
  createdAt DateTime  @default(now())

  projects  Project[]
  events    Event[]
  workflows Workflow[]
  @@map("tenants")
}

model Project {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  createdAt DateTime @default(now())

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  apiKeys   ApiKey[]
  @@index([tenantId])
  @@map("projects")
}

model ApiKey {
  id        String   @id @default(cuid())
  tenantId  String
  projectId String
  keyHash   String   @unique    // bcrypt hash — never store raw key
  prefix    String              // "pk_live_" or "pk_test_"
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([tenantId])
  @@map("api_keys")
}
```

---

## 2. API Key Format

```
pk_live_<random_32_chars>
pk_test_<random_32_chars>
```

Rules:
- Always store the **hash** (`keyHash`), never the raw key.
- Only return the raw key **once** at creation time.
- `pk_test_` keys operate in sandbox mode.

---

## 3. API Key Validation Middleware (apps/api)

```typescript
import bcrypt from 'bcrypt';
import { db } from '@devent/database';
import { logger } from '@devent/utils';

export async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing API key' });
  }

  const rawKey = authHeader.slice(7);
  const prefix = rawKey.slice(0, 8); // "pk_live_" or "pk_test_"

  const candidates = await db.apiKey.findMany({
    where: { prefix, isActive: true },
    include: { tenant: true, project: true },
  });

  const match = candidates.find(k => bcrypt.compareSync(rawKey, k.keyHash));
  if (!match) return res.status(401).json({ error: 'Invalid API key' });

  req.tenantId  = match.tenantId;
  req.projectId = match.projectId;
  req.tenant    = match.tenant;

  next();
}
```

---

## 4. Tenant Context Augmentation

```typescript
// apps/api/src/types/express.d.ts
import type { Tenant } from '@devent/database';

declare namespace Express {
  interface Request {
    tenantId: string;
    projectId: string;
    tenant: Tenant;
  }
}
```

---

## 5. Scoped DB Queries — Always

```typescript
import { db } from '@devent/database';

// ✅ CORRECT — always scope by tenantId
const events = await db.event.findMany({
  where: {
    tenantId: req.tenantId,
    eventName: 'user_registered',
  },
});

// ❌ WRONG — missing tenantId scope
const events = await db.event.findMany({
  where: { eventName: 'user_registered' },
});
```

---

## 6. Redis Cache Keys — Tenant-Scoped

Every Redis key must include `tenantId`. Use the Redis instance from `@devent/queues`:

```typescript
import { redis } from '@devent/queues';

// ✅ Always namespaced
const WORKFLOWS_KEY   = (tenantId: string) => `tenant:${tenantId}:workflows`;
const RATE_KEY        = (tenantId: string) => `rate:${tenantId}`;
const DASHBOARD_KEY   = (tenantId: string) => `tenant:${tenantId}:dashboard`;
```

---

## 7. Rate Limiting Per Tenant

```typescript
import { redis } from '@devent/queues';
import { RateLimitError } from '@devent/utils';

const RATE_LIMITS: Record<string, number> = {
  free: 100,       // events/min
  pro: 10_000,
  enterprise: Infinity,
};

export async function checkRateLimit(tenantId: string, plan: string) {
  const key = `rate:${tenantId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);

  const limit = RATE_LIMITS[plan] ?? 100;
  if (count > limit) throw new RateLimitError(`Rate limit exceeded`);
}
```

---

## 8. BullMQ Jobs — Always Include tenantId

```typescript
import { eventQueue } from '@devent/queues';

// ✅ CORRECT
await eventQueue.add('process-event', {
  eventId: 'evt_123',
  tenantId: tenant.id,
});

// ❌ WRONG — worker has no tenant scope
await eventQueue.add('process-event', {
  eventId: 'evt_123',
});
```

---

## 9. Tenant Isolation Checklist

Before merging any feature, verify:

- [ ] Every `db.*` query filters by `tenantId`
- [ ] Every Redis key includes `tenantId`
- [ ] Every BullMQ job payload includes `tenantId`
- [ ] API responses never include other tenants' data
- [ ] Error messages do not leak `tenantId` or internal IDs externally
- [ ] API key hash stored, not raw key

---

## 10. What NOT to do

- ❌ Do NOT query any Prisma model without `where: { tenantId }`.
- ❌ Do NOT store raw API keys in the database.
- ❌ Do NOT share Redis cache entries across tenants.
- ❌ Do NOT expose `tenantId` UUIDs in public error messages.
- ❌ Do NOT create a new Redis connection — import `redis` from `@devent/queues`.
- ❌ Do NOT create a new Prisma client — import `db` from `@devent/database`.
