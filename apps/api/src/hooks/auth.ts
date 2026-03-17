import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '@devent/database';
import { redis } from '@devent/queues';
import { AuthError, RateLimitError } from '@devent/utils';

const RATE_LIMITS: Record<string, number> = {
  free: 100,
  pro: 10_000,
  enterprise: Number.MAX_SAFE_INTEGER,
};

async function resolveTenantFromApiKey(rawKey: string) {
  const prefix = rawKey.startsWith('pk_live_')
    ? 'pk_live_'
    : rawKey.startsWith('pk_test_')
      ? 'pk_test_'
      : null;

  if (!prefix) {
    throw new AuthError('Invalid API key');
  }

  const candidates = await db.apiKey.findMany({
    where: { prefix, isActive: true },
    include: {
      tenant: true,
      project: true,
    },
  });

  for (const candidate of candidates) {
    const isMatch = await bcrypt.compare(rawKey, candidate.keyHash);
    if (!isMatch) continue;

    return {
      tenantId: candidate.tenantId,
      plan: candidate.tenant.plan,
      projectId: candidate.projectId,
    };
  }

  throw new AuthError('Invalid API key');
}

async function checkRateLimit(tenantId: string, plan: string) {
  const key = `rate:${tenantId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 60);
  }

  const limit = RATE_LIMITS[plan] ?? RATE_LIMITS.free;
  if (count > limit) {
    throw new RateLimitError('Rate limit exceeded');
  }
}

export async function validateApiKeyHook(request: FastifyRequest, reply: FastifyReply) {
  if (request.url.startsWith('/health')) {
    return;
  }

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthError('Missing API key');
    }

    const rawKey = authHeader.slice(7);
    const tenant = await resolveTenantFromApiKey(rawKey);
    await checkRateLimit(tenant.tenantId, tenant.plan);

    request.tenant = tenant;
  } catch (error: unknown) {
    if (error instanceof AuthError || error instanceof RateLimitError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    return reply.status(500).send({ error: 'Internal server error' });
  }
}
