# 2026-03-16 - Prisma linux-musl runtime fix in Docker worker

## Goal and Scope
- Goal: fix `PrismaClientInitializationError` in Linux Alpine containers caused by missing query engine target.
- In scope: Prisma generator `binaryTargets` update and compose dependency step update to run client generation before app startup.
- Out of scope: Prisma 7 migration and prisma.config.ts migration.

## Design Decisions
- Added explicit multi-platform `binaryTargets` in Prisma generator:
  - `native`
  - `windows`
  - `linux-musl-openssl-3.0.x`
- Updated compose `deps` service command to execute:
  - `npm install`
  - `npm run prisma:generate --workspace @devent/database`
- This guarantees worker/api containers start with the proper linux-musl query engine artifacts available.

## Impacted Areas
- `packages/database/prisma/schema.prisma`
- `infra/docker/docker-compose.yml`

## Contracts and Data Changes
- No API contract changes.
- No schema model changes.

## Security and Multitenancy Notes
- No changes in security or tenant scoping logic.

## Observability Notes
- No new logs introduced.

## Validation and Testing
- Executed:
  - `npm run prisma:generate --workspace @devent/database`
  - `docker compose -f infra/docker/docker-compose.yml config`
- Result:
  - Prisma client generated successfully with windows + linux-musl engines.
  - Compose config valid.

## Status and Next Steps
- Status: done
- Next actions:
  - run `docker compose up -d deps` then `docker compose up -d` to apply fix in containers.
  - consider migrating Prisma config deprecation (`package.json#prisma`) to `prisma.config.ts` in future task.

## References
- Related files:
  - `packages/database/prisma/schema.prisma`
  - `infra/docker/docker-compose.yml`
- Commits/PRs: pending
