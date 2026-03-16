# SKILL_MONOREPO.md — Turborepo Monorepo Conventions

Use this skill when adding a new package, adding a dependency between packages, configuring Turborepo tasks, or setting up the Docker infra.

---

## 1. Workspace Layout

```
ddevent-platform/
├── apps/           ← Runnable applications
│   ├── api/
│   ├── worker/
│   └── dashboard/
├── packages/       ← Shared, importable code
│   ├── database/
│   ├── events/
│   ├── workflows/
│   ├── queues/
│   ├── sdk/
│   └── utils/
└── infra/
    └── docker/
        └── docker-compose.yml
```

Root `package.json` declares npm workspaces:

```json
{
  "workspaces": ["apps/*", "packages/*"]
}
```

---

## 2. apps/api — Fastify Bootstrap

`apps/api` runs a **Fastify** server. It is the thin ingestion layer.

```typescript
// apps/api/src/index.ts
import Fastify from 'fastify';
import { registerEventsRoutes } from './routes/events';
import { validateApiKeyHook } from './hooks/auth';
import { logger } from '@devent/utils';

const app = Fastify({ logger: true });

// Global preHandler for API key auth
app.addHook('preHandler', validateApiKeyHook);

// Routes
await app.register(registerEventsRoutes, { prefix: '/v1' });

await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
logger.info({ msg: 'api.started', port: 3001 });
```

```json
// apps/api/package.json (key deps)
{
  "dependencies": {
    "fastify":         "^5",
    "@fastify/cors":   "^10",
    "@devent/database": "*",
    "@devent/events":   "*",
    "@devent/queues":   "*",
    "@devent/utils":    "*",
    "zod":             "^3"
  }
}
```

---

## 2. Dependency Rules

```
packages/utils          ← no internal deps (leaf)
packages/events         ← no internal deps (leaf)
packages/workflows      ← @devent/events, @devent/utils
packages/database       ← @devent/utils
packages/queues         ← @devent/events, @devent/utils

apps/api                ← @devent/database, @devent/events, @devent/queues, @devent/workflows, @devent/utils
apps/worker             ← @devent/database, @devent/events, @devent/queues, @devent/workflows, @devent/utils
apps/dashboard          ← @devent/events (types only)
packages/sdk            ← standalone (no internal deps)
```

**Critical rule:** `packages/` must NEVER import from `apps/`.

---

## 3. Package Naming Convention

All internal packages use the `@devent/` scope in `package.json`:

```json
// packages/events/package.json
{
  "name": "@devent/events",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

To use a package inside an app:

```json
// apps/api/package.json
{
  "dependencies": {
    "@devent/events": "*",
    "@devent/database": "*",
    "@devent/queues": "*"
  }
}
```

Then import normally:

```typescript
import { EventPayload } from '@devent/events';
import { db } from '@devent/database';
import { eventQueue } from '@devent/queues';
```

---

## 4. packages/events — Shared Event Types

This package defines the canonical event shape shared by API, worker, and SDK.

```typescript
// packages/events/src/index.ts

export type EventPayload = {
  event: string
  tenantId: string
  data: Record<string, unknown>
  timestamp?: string    // ISO 8601, defaults to NOW on API
  source?: string       // 'sdk' | 'api' | 'batch'
}

export type StoredEvent = EventPayload & {
  id: string
  createdAt: string
}
```

All apps import from `@devent/events`. Never redefine these types locally.

---

## 5. packages/database — Prisma Client

Single source of truth for DB access.

### Structure

```
packages/database/
├── prisma/
│   └── schema.prisma
└── src/
    └── client.ts
```

### client.ts

```typescript
// packages/database/src/client.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export * from '@prisma/client'; // re-export Prisma types
```

### Usage in apps

```typescript
import { db } from '@devent/database';

const event = await db.event.create({ data: { ... } });
```

### Migrations

Run from the `packages/database` directory:

```bash
cd packages/database
npx prisma migrate dev --name init
npx prisma generate
```

---

## 6. packages/queues — Shared BullMQ Queues

Defines queue instances used by both the API (to enqueue) and workers (to consume).

```typescript
// packages/queues/src/index.ts
import { Queue } from 'bullmq';
import { redis } from './redis';

export const eventQueue    = new Queue('events',       { connection: redis });
export const workflowQueue = new Queue('workflows',    { connection: redis });
export const webhookQueue  = new Queue('webhooks',     { connection: redis });
export const analyticsQueue = new Queue('analytics',   { connection: redis });
export const cleanupQueue  = new Queue('cleanup',      { connection: redis });

// Redis connection
// packages/queues/src/redis.ts
import { Redis } from 'ioredis';
export const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
```

**API** imports queues to enqueue. **Worker** imports queues to create `Worker` consumers.

---

## 7. packages/utils — Shared Utilities

Common helpers used everywhere:

```typescript
// packages/utils/src/index.ts

// Structured logger
export { logger } from './logger';

// Error classes
export { AppError, ValidationError, AuthError, RateLimitError } from './errors';

// Validation helpers
export { validateEventPayload } from './validation';
```

### Logger pattern

```typescript
// packages/utils/src/logger.ts
import pino from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
```

Usage in any app or package:

```typescript
import { logger } from '@devent/utils';
logger.info({ msg: 'event.received', tenantId, eventName });
```

---

## 8. packages/sdk — Client SDK

Standalone package, publishable to npm. No internal `@devent/` dependencies.

```typescript
// packages/sdk/src/index.ts
export class DeventClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.devent.io';
  }

  async track(event: string, data: Record<string, unknown> = {}): Promise<void> {
    await fetch(`${this.baseUrl}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
    });
  }
}
```

SDK `package.json` should have `"private": false` and a proper `"version"` to be publishable.

---

## 9. turbo.json — Task Pipeline

Current `turbo.json` tells Turbo to build packages before apps (`"dependsOn": ["^build"]`).

To add a new task (e.g., `db:migrate`):

```json
{
  "tasks": {
    "db:migrate": {
      "cache": false,
      "inputs": ["prisma/schema.prisma"]
    }
  }
}
```

Run a task across the repo:

```bash
turbo run build           # build all apps and packages in order
turbo run dev             # start all dev servers in parallel
turbo run lint            # lint everything
turbo run check-types     # TypeScript check everything
```

Run for a single app:

```bash
turbo run dev --filter=dashboard
turbo run dev --filter=api
turbo run dev --filter=worker
```

---

## 10. infra/docker/docker-compose.yml

The Docker Compose file runs all services locally:

```yaml
# infra/docker/docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: devent
      POSTGRES_PASSWORD: devent
      POSTGRES_DB: devent
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  api:
    build:
      context: ../..
      dockerfile: apps/api/Dockerfile
    env_file: ../../apps/api/.env
    ports:
      - '3001:3001'
    depends_on:
      - postgres
      - redis

  worker:
    build:
      context: ../..
      dockerfile: apps/worker/Dockerfile
    env_file: ../../apps/worker/.env
    depends_on:
      - postgres
      - redis

  dashboard:
    build:
      context: ../..
      dockerfile: apps/dashboard/Dockerfile
    env_file: ../../apps/dashboard/.env
    ports:
      - '3000:3000'
    depends_on:
      - api

volumes:
  pgdata:
```

Start everything:

```bash
docker compose -f infra/docker/docker-compose.yml up
```

---

## 11. Environment Variables Per App

Each app has its own `.env` file. **Never commit `.env` files.**

### apps/api/.env
```env
DATABASE_URL=postgresql://devent:devent@localhost:5432/devent
REDIS_URL=redis://localhost:6379
NODE_ENV=development
PORT=3001
```

### apps/worker/.env
```env
DATABASE_URL=postgresql://devent:devent@localhost:5432/devent
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

### apps/dashboard/.env.local
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 12. What NOT to do

- ❌ Do NOT import from `apps/` inside any `packages/` package.
- ❌ Do NOT define a Prisma client outside of `packages/database`.
- ❌ Do NOT create a second Redis connection outside of `packages/queues`.
- ❌ Do NOT duplicate types between packages — define once, import everywhere.
- ❌ Do NOT run `npm install` in individual app directories — always run from the root.
- ❌ Do NOT commit `.env` files.
- ❌ Do NOT make `packages/sdk` depend on internal `@devent/` packages (it must be standalone).
