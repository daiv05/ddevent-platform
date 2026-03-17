import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@devent/database';
import { db } from '@devent/database';
import { eventQueue } from '@devent/queues';
import { logger } from '@devent/utils';

const IncomingEventSchema = z.object({
  event: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/),
  data: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime().optional(),
  source: z.enum(['sdk', 'api', 'batch']).default('api'),
});

const ListEventsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  eventName: z.string().min(1).max(100).optional(),
  source: z.enum(['sdk', 'api', 'batch']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const registerEventsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/events', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const queryParse = ListEventsQuerySchema.safeParse(request.query);
    if (!queryParse.success) {
      return reply.status(400).send({ error: 'Invalid query params' });
    }

    const { page, pageSize, eventName, source, from, to } = queryParse.data;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EventWhereInput = {
      tenantId: tenant.tenantId,
      ...(eventName ? { eventName } : {}),
      ...(source ? { source } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };

    const [events, total] = await Promise.all([
      db.event.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.event.count({ where }),
    ]);

    return reply.send({
      events,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  });

  app.get('/events/:id', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const params = request.params as { id: string };

    const event = await db.event.findFirst({
      where: {
        id: params.id,
        tenantId: tenant.tenantId,
      },
    });

    if (!event) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    return reply.send({ event });
  });

  app.post('/events', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parsed = IncomingEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid event payload' });
    }

    const { event, data, timestamp, source } = parsed.data;

    logger.info({
      msg: 'event.received',
      service: 'api',
      tenant_id: tenant.tenantId,
      event_name: event,
    });

    const storedEvent = await db.event.create({
      data: {
        tenantId: tenant.tenantId,
        eventName: event,
        source,
        payload: data as Prisma.InputJsonValue,
        createdAt: timestamp ? new Date(timestamp) : new Date(),
      },
    });

    logger.info({
      msg: 'event.stored',
      service: 'api',
      tenant_id: tenant.tenantId,
      event_id: storedEvent.id,
      event_name: event,
    });

    await eventQueue.add('process-event', {
      eventId: storedEvent.id,
      tenantId: tenant.tenantId,
    });

    logger.info({
      msg: 'event.queued',
      service: 'api',
      tenant_id: tenant.tenantId,
      event_id: storedEvent.id,
      event_name: event,
    });

    return reply.status(202).send({ eventId: storedEvent.id });
  });
};
