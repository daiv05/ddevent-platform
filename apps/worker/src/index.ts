import { Worker } from 'bullmq';
import { db } from '@devent/database';
import { bullmqConnection, redis } from '@devent/queues';
import { logger } from '@devent/utils';
import { processEvent } from './handlers/processEvent';
import { runWorkflows } from './handlers/runWorkflows';
import { updateAnalytics } from './handlers/updateAnalytics';
import { dispatchWebhook } from './handlers/dispatchWebhook';

const eventWorker = new Worker(
  'events',
  async (job) => {
    const { eventId, tenantId } = job.data as { eventId: string; tenantId: string };
    await processEvent(eventId, tenantId);
  },
  {
    connection: bullmqConnection,
    concurrency: 20,
  }
);

const workflowWorker = new Worker(
  'workflows',
  async (job) => {
    const { eventId, tenantId, eventName } = job.data as {
      eventId: string;
      tenantId: string;
      eventName: string;
    };
    await runWorkflows(eventId, tenantId, eventName);
  },
  {
    connection: bullmqConnection,
    concurrency: 10,
  }
);

const analyticsWorker = new Worker(
  'analytics',
  async (job) => {
    const { eventId, tenantId, eventName, date } = job.data as {
      eventId: string;
      tenantId: string;
      eventName: string;
      date: string;
    };
    await updateAnalytics(eventId, tenantId, eventName, date);
  },
  {
    connection: bullmqConnection,
    concurrency: 50,
  }
);

const webhookWorker = new Worker(
  'webhooks',
  async (job) => {
    const data = job.data as {
      eventId: string;
      tenantId: string;
      workflowId: string;
      url: string;
      payload: Record<string, unknown>;
    };
    await dispatchWebhook({
      ...data,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
    });
  },
  {
    connection: bullmqConnection,
    concurrency: 20,
  }
);

for (const worker of [eventWorker, workflowWorker, analyticsWorker, webhookWorker]) {
  worker.on('active', (job) => {
    logger.info({
      msg: 'worker.job_started',
      service: 'worker',
      queue: worker.name,
      job_id: job.id,
      job_name: job.name,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error({
      msg: 'worker.job_failed',
      service: 'worker',
      queue: worker.name,
      job_id: job?.id,
      job_name: job?.name,
      attempt: job ? job.attemptsMade + 1 : undefined,
      max_attempts: job?.opts?.attempts,
      error: error.message,
    });
  });
}

logger.info({
  msg: 'worker.started',
  service: 'worker',
  queues: ['events', 'workflows', 'analytics', 'webhooks'],
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({
    msg: 'worker.shutdown_started',
    service: 'worker',
    signal,
  });

  await Promise.all([
    eventWorker.close(),
    workflowWorker.close(),
    analyticsWorker.close(),
    webhookWorker.close(),
  ]);

  await Promise.all([db.$disconnect(), redis.quit()]);

  logger.info({
    msg: 'worker.shutdown_completed',
    service: 'worker',
  });

  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
