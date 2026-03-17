import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

async function main() {
  const tenantSlug = envOrDefault('DEVENT_SEED_TENANT_SLUG', 'acme');
  const tenantName = envOrDefault('DEVENT_SEED_TENANT_NAME', 'Acme Inc');
  const projectName = envOrDefault('DEVENT_SEED_PROJECT_NAME', 'Main Project');
  const plan = envOrDefault('DEVENT_SEED_PLAN', 'free');

  const tenantExternalId = `tenant_${tenantSlug}`;

  const tenant = await prisma.tenant.upsert({
    where: { tenantId: tenantExternalId },
    update: {
      name: tenantName,
      plan,
      slug: tenantSlug,
    },
    create: {
      tenantId: tenantExternalId,
      slug: tenantSlug,
      name: tenantName,
      plan,
    },
  });

  const project = await prisma.project.upsert({
    where: {
      id: `${tenantSlug}-main-project`,
    },
    update: {
      name: projectName,
    },
    create: {
      id: `${tenantSlug}-main-project`,
      tenantId: tenant.tenantId,
      name: projectName,
    },
  });

  const providedApiKey = process.env.DEVENT_SEED_API_KEY;
  const generatedApiKey = `pk_test_${randomBytes(24).toString('hex')}`;
  const apiKey = providedApiKey && providedApiKey.startsWith('pk_') ? providedApiKey : generatedApiKey;
  const prefix = apiKey.startsWith('pk_live_') ? 'pk_live_' : 'pk_test_';
  const keyHash = await bcrypt.hash(apiKey, 10);

  await prisma.apiKey.updateMany({
    where: {
      projectId: project.id,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });

  await prisma.apiKey.create({
    data: {
      tenantId: tenant.tenantId,
      projectId: project.id,
      prefix,
      keyHash,
      isActive: true,
    },
  });

  // Seed output prints the raw key once for local development usage.
  console.log('Seed completed');
  console.log(`tenantId=${tenant.tenantId}`);
  console.log(`projectId=${project.id}`);
  console.log(`apiKey=${apiKey}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
