import { db } from '@devent/database';
import { webhookQueue } from '@devent/queues';
import { logger } from '@devent/utils';
import { matchesConditions, type WorkflowAction } from '@devent/workflows';
import { getCachedWorkflows } from '../cache/workflows';
import { isAlreadyProcessed, markProcessed } from './idempotency';

const WORKER_TYPE = 'workflow-runner';

function isWebhookAction(action: WorkflowAction): action is WorkflowAction & { url: string } {
  return action.type === 'webhook' && typeof action.url === 'string' && action.url.length > 0;
}

export async function runWorkflows(eventId: string, tenantId: string, eventName: string) {
  if (await isAlreadyProcessed(eventId, WORKER_TYPE)) {
    logger.info({
      msg: 'workflow.skipped',
      service: 'worker',
      event_id: eventId,
      tenant_id: tenantId,
      reason: 'already_processed',
    });
    return;
  }

  const event = await db.event.findFirst({
    where: { id: eventId, tenantId },
  });

  if (!event) {
    logger.warn({
      msg: 'workflow.event_missing',
      service: 'worker',
      event_id: eventId,
      tenant_id: tenantId,
    });
    return;
  }

  const rules = await getCachedWorkflows(tenantId, eventName);

  const payload = event.payload as Record<string, unknown>;
  const workflowContext = {
    data: payload,
    ...payload,
  };

  for (const rule of rules) {
    const conditions = Array.isArray(rule.conditions) ? (rule.conditions as any[]) : [];
    const actions = Array.isArray(rule.actions) ? (rule.actions as WorkflowAction[]) : [];

    const matched = matchesConditions(workflowContext, conditions as any);
    if (!matched) {
      await db.workflowExecution.create({
        data: {
          tenantId,
          workflowId: rule.id,
          eventId,
          status: 'skipped',
        },
      });
      continue;
    }

    let dispatchedActions = 0;

    for (const action of actions) {
      if (!isWebhookAction(action)) continue;

      await webhookQueue.add(
        'dispatch-webhook',
        {
          eventId,
          tenantId,
          workflowId: rule.id,
          url: action.url,
          payload: {
            event: event.eventName,
            data: payload,
          },
        },
        {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 60_000,
          },
        }
      );

      dispatchedActions += 1;
    }

    if (dispatchedActions === 0) {
      await db.workflowExecution.create({
        data: {
          tenantId,
          workflowId: rule.id,
          eventId,
          status: 'skipped',
          error: 'No supported actions to dispatch',
        },
      });

      logger.warn({
        msg: 'workflow.skipped',
        service: 'worker',
        tenant_id: tenantId,
        event_id: eventId,
        workflow_id: rule.id,
        reason: 'no_supported_actions',
      });

      continue;
    }

    await db.workflowExecution.create({
      data: {
        tenantId,
        workflowId: rule.id,
        eventId,
        status: 'success',
      },
    });

    logger.info({
      msg: 'workflow.executed',
      service: 'worker',
      tenant_id: tenantId,
      event_id: eventId,
      workflow_id: rule.id,
    });
  }

  await markProcessed(eventId, tenantId, WORKER_TYPE);
}
