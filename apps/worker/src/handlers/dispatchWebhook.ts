import { createHmac } from 'node:crypto';
import { logger } from '@devent/utils';
import { isAlreadyProcessed, markProcessed } from './idempotency';

type DispatchWebhookJob = {
  eventId: string;
  tenantId: string;
  workflowId: string;
  url: string;
  payload: Record<string, unknown>;
  attempt?: number;
  maxAttempts?: number;
};

const WEBHOOK_TIMEOUT_MS = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 8000);

function buildWebhookSignature(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function getWebhookWorkerType(job: DispatchWebhookJob) {
  return `webhook-dispatch:${job.workflowId}:${job.url}`;
}

export async function dispatchWebhook(job: DispatchWebhookJob) {
  const workerType = getWebhookWorkerType(job);
  const serializedPayload = JSON.stringify(job.payload);
  const timestamp = new Date().toISOString();
  const signingSecret = process.env.WEBHOOK_SIGNING_SECRET;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Devent-Event-Id': job.eventId,
    'X-Devent-Tenant-Id': job.tenantId,
    'X-Devent-Workflow-Id': job.workflowId,
    'X-Devent-Timestamp': timestamp,
  };

  if (signingSecret) {
    headers['X-Devent-Signature'] = buildWebhookSignature(signingSecret, timestamp, serializedPayload);
  }

  if (await isAlreadyProcessed(job.eventId, workerType)) {
    logger.info({
      msg: 'webhook.skipped',
      service: 'worker',
      tenant_id: job.tenantId,
      event_id: job.eventId,
      workflow_id: job.workflowId,
      url: job.url,
      reason: 'already_processed',
    });
    return;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), WEBHOOK_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(job.url, {
      method: 'POST',
      headers,
      body: serializedPayload,
      signal: abortController.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error({
      msg: 'webhook.failed',
      service: 'worker',
      tenant_id: job.tenantId,
      event_id: job.eventId,
      workflow_id: job.workflowId,
      url: job.url,
      status: response.status,
      attempt: job.attempt,
      max_attempts: job.maxAttempts,
      error: body.slice(0, 300),
    });

    throw new Error(`Webhook dispatch failed with status ${response.status}`);
  }

  await markProcessed(job.eventId, job.tenantId, workerType);

  logger.info({
    msg: 'webhook.sent',
    service: 'worker',
    tenant_id: job.tenantId,
    event_id: job.eventId,
    workflow_id: job.workflowId,
    url: job.url,
    attempt: job.attempt,
    max_attempts: job.maxAttempts,
  });
}
