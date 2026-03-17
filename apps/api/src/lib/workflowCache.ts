import { redis } from '@devent/queues';

function cacheKey(tenantId: string, eventName: string) {
  return `tenant:${tenantId}:workflows:${eventName}`;
}

export async function invalidateWorkflowCache(tenantId: string, eventName: string) {
  await redis.del(cacheKey(tenantId, eventName));
}
