import { db } from '@devent/database';
import { analyticsQueue, workflowQueue } from '@devent/queues';
import { logger } from '@devent/utils';
import { isAlreadyProcessed, markProcessed } from './idempotency';

const WORKER_TYPE = 'event-dispatch';

export async function processEvent(eventId: string, tenantId: string) {
  if (await isAlreadyProcessed(eventId, WORKER_TYPE)) {
    logger.info({
      msg: 'worker.event_skipped',
      service: 'worker',
      event_id: eventId,
      tenant_id: tenantId,
      worker_type: WORKER_TYPE,
      reason: 'already_processed',
    });
    return;
  }

  const event = await db.event.findFirst({
    where: {
      id: eventId,
      tenantId,
    },
  });

  if (!event) {
    logger.warn({
      msg: 'worker.event_missing',
      service: 'worker',
      event_id: eventId,
      tenant_id: tenantId,
      worker_type: WORKER_TYPE,
    });
    return;
  }

  await Promise.all([
    workflowQueue.add('run-workflows', {
      eventId: event.id,
      tenantId: event.tenantId,
      eventName: event.eventName,
    }),
    analyticsQueue.add('update-analytics', {
      eventId: event.id,
      tenantId: event.tenantId,
      eventName: event.eventName,
      date: event.createdAt.toISOString().slice(0, 10),
    }),
  ]);

  await markProcessed(event.id, event.tenantId, WORKER_TYPE);

  logger.info({
    msg: 'worker.event_dispatched',
    service: 'worker',
    event_id: event.id,
    tenant_id: event.tenantId,
    event_name: event.eventName,
  });
}
