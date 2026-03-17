import { db } from '@devent/database';

export async function isAlreadyProcessed(eventId: string, workerType: string) {
  const record = await db.eventProcessing.findUnique({
    where: {
      eventId_workerType: {
        eventId,
        workerType,
      },
    },
  });

  return Boolean(record);
}

export async function markProcessed(eventId: string, tenantId: string, workerType: string) {
  await db.eventProcessing.create({
    data: {
      eventId,
      tenantId,
      workerType,
    },
  });
}
