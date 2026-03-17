import Fastify from 'fastify';
import cors from '@fastify/cors';
import { logger } from '@devent/utils';
import { validateApiKeyHook } from './hooks/auth';
import { registerEventsRoutes } from './routes/events';
import { registerWorkflowsRoutes } from './routes/workflows';

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  app.get('/health', async () => ({ ok: true }));

  app.addHook('preHandler', validateApiKeyHook);
  await app.register(registerEventsRoutes, { prefix: '/v1' });
  await app.register(registerWorkflowsRoutes, { prefix: '/v1' });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ port, host: '0.0.0.0' });

  logger.info({
    msg: 'api.started',
    service: 'api',
    port,
  });
}

void start();
