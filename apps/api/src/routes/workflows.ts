import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '@devent/database';
import { logger } from '@devent/utils';
import { invalidateWorkflowCache } from '../lib/workflowCache';

const WorkflowConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'exists']),
  value: z.string().optional(),
});

const WorkflowActionSchema = z.object({
  type: z.enum(['webhook', 'send_email', 'slack', 'discord', 'integration']),
  url: z.string().url().optional(),
}).superRefine((action, ctx) => {
  if (action.type === 'webhook' && !action.url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Webhook actions require a valid url',
      path: ['url'],
    });
  }
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  triggerEvent: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/),
  conditions: z.array(WorkflowConditionSchema).default([]),
  actions: z.array(WorkflowActionSchema).min(1),
  isActive: z.boolean().default(true),
});

const UpdateWorkflowSchema = CreateWorkflowSchema.partial();

const WorkflowRunsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const registerWorkflowsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/workflows', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) return reply.status(401).send({ error: 'Unauthorized' });

    const workflows = await db.workflow.findMany({
      where: { tenantId: tenant.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ workflows });
  });

  app.post('/workflows', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) return reply.status(401).send({ error: 'Unauthorized' });

    const parsed = CreateWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid workflow payload' });
    }

    const workflow = await db.workflow.create({
      data: {
        tenantId: tenant.tenantId,
        name: parsed.data.name,
        triggerEvent: parsed.data.triggerEvent,
        conditions: parsed.data.conditions,
        actions: parsed.data.actions,
        isActive: parsed.data.isActive,
      },
    });

    await invalidateWorkflowCache(tenant.tenantId, workflow.triggerEvent);

    logger.info({
      msg: 'workflow.created',
      service: 'api',
      tenant_id: tenant.tenantId,
      workflow_id: workflow.id,
      event_name: workflow.triggerEvent,
    });

    return reply.status(201).send({ workflow });
  });

  app.get('/workflows/:id', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) return reply.status(401).send({ error: 'Unauthorized' });

    const params = request.params as { id: string };

    const workflow = await db.workflow.findFirst({
      where: {
        id: params.id,
        tenantId: tenant.tenantId,
      },
    });

    if (!workflow) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    return reply.send({ workflow });
  });

  app.put('/workflows/:id', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) return reply.status(401).send({ error: 'Unauthorized' });

    const params = request.params as { id: string };
    const parsed = UpdateWorkflowSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid workflow payload' });
    }

    const existing = await db.workflow.findFirst({
      where: {
        id: params.id,
        tenantId: tenant.tenantId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    const updated = await db.workflow.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        triggerEvent: parsed.data.triggerEvent,
        conditions: parsed.data.conditions,
        actions: parsed.data.actions,
        isActive: parsed.data.isActive,
      },
    });

    const cacheEvents = new Set([existing.triggerEvent, updated.triggerEvent]);
    await Promise.all(
      [...cacheEvents].map((eventName) => invalidateWorkflowCache(tenant.tenantId, eventName))
    );

    logger.info({
      msg: 'workflow.updated',
      service: 'api',
      tenant_id: tenant.tenantId,
      workflow_id: updated.id,
      event_name: updated.triggerEvent,
    });

    return reply.send({ workflow: updated });
  });

  app.delete('/workflows/:id', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) return reply.status(401).send({ error: 'Unauthorized' });

    const params = request.params as { id: string };

    const existing = await db.workflow.findFirst({
      where: {
        id: params.id,
        tenantId: tenant.tenantId,
      },
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    const removed = await db.workflow.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    await invalidateWorkflowCache(tenant.tenantId, removed.triggerEvent);

    logger.info({
      msg: 'workflow.disabled',
      service: 'api',
      tenant_id: tenant.tenantId,
      workflow_id: removed.id,
      event_name: removed.triggerEvent,
    });

    return reply.status(204).send();
  });

  app.get('/workflows/:id/runs', async (request, reply) => {
    const tenant = request.tenant;
    if (!tenant) return reply.status(401).send({ error: 'Unauthorized' });

    const params = request.params as { id: string };
    const queryParse = WorkflowRunsQuerySchema.safeParse(request.query);

    if (!queryParse.success) {
      return reply.status(400).send({ error: 'Invalid query params' });
    }

    const { page, pageSize } = queryParse.data;
    const skip = (page - 1) * pageSize;

    const workflow = await db.workflow.findFirst({
      where: {
        id: params.id,
        tenantId: tenant.tenantId,
      },
      select: { id: true },
    });

    if (!workflow) {
      return reply.status(404).send({ error: 'Workflow not found' });
    }

    const [runs, total] = await Promise.all([
      db.workflowExecution.findMany({
        where: {
          workflowId: workflow.id,
          tenantId: tenant.tenantId,
        },
        orderBy: { executedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      db.workflowExecution.count({
        where: {
          workflowId: workflow.id,
          tenantId: tenant.tenantId,
        },
      }),
    ]);

    return reply.send({
      runs,
      pagination: {
        page,
        pageSize,
        total,
      },
    });
  });
};
