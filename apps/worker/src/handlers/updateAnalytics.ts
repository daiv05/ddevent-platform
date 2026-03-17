import { redis } from '@devent/queues';
import { logger } from '@devent/utils';
import { isAlreadyProcessed, markProcessed } from './idempotency';

const WORKER_TYPE = 'analytics-updater';

export async function updateAnalytics(
  eventId: string,
  tenantId: string,
  eventName: string,
  date: string
) {
  if (await isAlreadyProcessed(eventId, WORKER_TYPE)) {
    return;
  }

  const redisKey = `tenant:${tenantId}:analytics:${date}`;
  await redis.hincrby(redisKey, eventName, 1);
  await redis.expire(redisKey, 60 * 60 * 24 * 30);

  await markProcessed(eventId, tenantId, WORKER_TYPE);

  logger.info({
    msg: 'analytics.updated',
    service: 'worker',
    tenant_id: tenantId,
    event_id: eventId,
    event_name: eventName,
  });
}
