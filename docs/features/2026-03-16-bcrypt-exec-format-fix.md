# 2026-03-16 - Fix API docker bcrypt Exec format error

## Goal and Scope
- Goal: fix API startup failure in Linux containers caused by native bcrypt binary mismatch (`ERR_DLOPEN_FAILED`, Exec format error).
- In scope: migrate bcrypt usage to pure JS bcryptjs in runtime paths and fix related TypeScript typings.
- Out of scope: broader dependency upgrades.

## Design Decisions
- Replaced `bcrypt` with `bcryptjs` in API auth middleware.
- Replaced `bcrypt` with `bcryptjs` in Prisma seed script to keep local/bootstrap path consistent.
- Added `@types/bcryptjs` for API TypeScript support.
- Adjusted Prisma JSON payload type in events route with `Prisma.InputJsonValue` cast.

## Impacted Areas
- `apps/api/package.json`
- `apps/api/src/hooks/auth.ts`
- `apps/api/src/routes/events.ts`
- `packages/database/package.json`
- `packages/database/prisma/seed.ts`

## Contracts and Data Changes
- No API contract changes.
- No schema model changes.

## Security and Multitenancy Notes
- API key hashing/compare logic preserved semantically.
- No tenant scoping changes.

## Observability Notes
- No new logs introduced.

## Validation and Testing
- Executed:
  - `npm install`
  - `turbo run check-types --filter=api --filter=@devent/database --ui=stream`
- Result:
  - type-check successful for affected modules.

## Status and Next Steps
- Status: done
- Next actions:
  - restart compose stack so containers use updated dependencies.

## References
- Related files:
  - `apps/api/package.json`
  - `apps/api/src/hooks/auth.ts`
  - `apps/api/src/routes/events.ts`
  - `packages/database/package.json`
  - `packages/database/prisma/seed.ts`
- Commits/PRs: pending
