# 2026-03-17 - Dashboard events fetch ECONNREFUSED fix

## Goal and Scope
- Goal: fix dashboard server-side events fetch failures (`fetch failed`, `ECONNREFUSED`) and avoid 500 rendering errors.
- In scope: events page fetch behavior, server-side API base URL configuration, compose env wiring, docs update.
- Out of scope: auth/session redesign for dashboard.

## Design Decisions
- Added server-side API URL override (`DEVENT_API_URL_SERVER`) with fallback to `NEXT_PUBLIC_API_URL`.
- Dashboard fetch now catches network errors and renders a friendly error state instead of throwing.
- Docker dashboard service now uses internal network URL (`http://api:3001/v1`) for server fetches.

## Impacted Areas
- `apps/dashboard/app/events/page.tsx`
- `apps/dashboard/.env.example`
- `.env.example`
- `infra/docker/docker-compose.yml`
- `README.md`

## Contracts and Data Changes
- No API contract changes.
- No schema changes.

## Security and Multitenancy Notes
- Dashboard still requires server-side API key env for event listing.
- No tenant scoping changes in API.

## Observability Notes
- No backend log changes; improved frontend runtime resilience through handled error state.

## Validation and Testing
- Executed:
  - `docker compose -f infra/docker/docker-compose.yml config`
  - `npm run build --workspace dashboard`
- Result:
  - compose config valid
  - dashboard builds successfully with updated events page

## Status and Next Steps
- Status: done
- Next actions:
  - restart compose services so dashboard uses new env wiring
  - run dashboard /events smoke with valid DEVENT_DASHBOARD_API_KEY

## References
- Related files:
  - `apps/dashboard/app/events/page.tsx`
  - `apps/dashboard/.env.example`
  - `.env.example`
  - `infra/docker/docker-compose.yml`
  - `README.md`
- Commits/PRs: pending
