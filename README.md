# Devent Platform

Devent es una plataforma multitenant y event-driven para ingestar, procesar y distribuir eventos de aplicaciones.

## Estado actual

- Fase 1: foundation de paquetes compartidos lista.
- Fase 2: API de ingestión (`POST /v1/events`) lista.
- Fase 3: worker base con idempotencia y fan-out listo.
- Fase 5 (infra local): bootstrap Docker + variables de entorno disponible.

## Requisitos

- Node.js >= 18
- npm >= 10
- Docker + Docker Compose

## Variables de entorno

Se incluyen ejemplos en:

- `.env.example`
- `apps/api/.env.example`
- `apps/worker/.env.example`
- `apps/dashboard/.env.example`

Variables relevantes de webhooks en worker:

- `WEBHOOK_TIMEOUT_MS`: timeout HTTP por intento de envío.
- `WEBHOOK_SIGNING_SECRET`: secreto opcional para firma `X-Devent-Signature`.

Variable relevante para dashboard server-side:

- `DEVENT_DASHBOARD_API_KEY`: API key usada por la ruta `/events` del dashboard para consultar la API.
- `DEVENT_API_URL_SERVER`: URL interna que usa el dashboard en server-side (en Docker usar `http://api:3001/v1`).

## Infra local (Docker)

El archivo de composición está en `infra/docker/docker-compose.yml`.

Levantar todo el stack:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

Apagar el stack:

```bash
docker compose -f infra/docker/docker-compose.yml down
```

Servicios expuestos:

- Dashboard: `http://localhost:3000`
- API: `http://localhost:3001`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Desarrollo local sin Docker

Instalar dependencias:

```bash
npm install
```

Levantar todos los workspaces en paralelo con Turbo:

```bash
npm run dev
```

Levantar servicios individuales:

```bash
npm run dev --workspace api
npm run dev --workspace worker
npm run dev --workspace dashboard
```

## Checks de calidad

Chequeo de tipos:

```bash
npm run check-types
```

Build:

```bash
npm run build
```

## Smoke test del flujo de eventos

1. Asegura que API y worker estén activos.
2. Ejecuta migración y seed local:

```bash
npm run prisma:migrate --workspace @devent/database -- --name init
npm run prisma:seed --workspace @devent/database
```

3. Usa el `apiKey` que imprime el seed.
4. Envía un evento:

```bash
curl -X POST http://localhost:3001/v1/events \
	-H "Content-Type: application/json" \
	-H "Authorization: Bearer <apiKey_from_seed>" \
	-d '{"event":"user_registered","data":{"plan":"pro"}}'
```

5. Verifica respuesta `202` con `eventId`.
6. Revisa logs de API/worker para checkpoints:
	 - `event.received`
	 - `event.stored`
	 - `event.queued`
	 - `worker.job_started`

## Documentación de funcionalidades

Cada funcionalidad trabajada debe documentarse en `docs/features/`.
Usa `docs/features/TEMPLATE.md` como base.
