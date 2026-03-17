# 2026-03-16 - Docker Compose fix for npm EEXIST

## Goal and Scope
- Goal: fix startup failure caused by concurrent `npm install` executions in multiple compose services.
- In scope: docker-compose service orchestration change to run dependency installation once.
- Out of scope: Dockerfile optimization and image build pipelines.

## Design Decisions
- Added a dedicated `deps` one-shot service that executes `npm install` once.
- Removed `npm install` from `api`, `worker`, and `dashboard` runtime commands.
- Added dependency ordering with `service_completed_successfully` so app services start only after dependencies are installed.

## Impacted Areas
- Infra:
  - `infra/docker/docker-compose.yml`

## Contracts and Data Changes
- No API/queue/schema contract changes.

## Security and Multitenancy Notes
- No security model changes.
- No tenant logic changes.

## Observability Notes
- No new logs added.

## Validation and Testing
- Executed:
  - `docker compose -f infra/docker/docker-compose.yml config`
- Result:
  - compose configuration valid after change.

## Status and Next Steps
- Status: done
- Next actions:
  - optionally move install step to image build stage to reduce startup time.

## References
- Related files:
  - `infra/docker/docker-compose.yml`
- Commits/PRs: pending
