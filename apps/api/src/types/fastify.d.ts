import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    tenant?: {
      tenantId: string;
      plan: string;
      projectId: string;
    };
  }
}
