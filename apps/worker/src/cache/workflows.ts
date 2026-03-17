import { db } from '@devent/database';
import { redis } from '@devent/queues';
import type { WorkflowRule } from '@devent/workflows';

const WORKFLOWS_CACHE_TTL_SECONDS = 300;

function cacheKey(tenantId: string, eventName: string) {
  return `tenant:${tenantId}:workflows:${eventName}`;
}

export async function getCachedWorkflows(
  tenantId: string,
  eventName: string
): Promise<WorkflowRule[]> {
  const key = cacheKey(tenantId, eventName);
  const cached = await redis.get(key);

  if (cached) {
    try {
      return JSON.parse(cached) as WorkflowRule[];
    } catch {
      await redis.del(key);
    }
  }

  const rules = await db.workflow.findMany({
    where: {
      tenantId,
      triggerEvent: eventName,
      isActive: true,
    },
  });

  await redis.setex(key, WORKFLOWS_CACHE_TTL_SECONDS, JSON.stringify(rules));
  return rules as unknown as WorkflowRule[];
}

export async function invalidateWorkflowCache(tenantId: string, eventName: string) {
  await redis.del(cacheKey(tenantId, eventName));
}
