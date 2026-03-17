import { Queue } from 'bullmq';
import { bullmqConnection, redis } from './redis';

export const eventQueue = new Queue('events', { connection: bullmqConnection });
export const workflowQueue = new Queue('workflows', { connection: bullmqConnection });
export const webhookQueue = new Queue('webhooks', { connection: bullmqConnection });
export const analyticsQueue = new Queue('analytics', { connection: bullmqConnection });
export const cleanupQueue = new Queue('cleanup', { connection: bullmqConnection });

export { redis };
export { bullmqConnection };
