export type EventSource = 'sdk' | 'api' | 'batch';

export type EventPayload = {
  event: string;
  tenantId: string;
  data: Record<string, unknown>;
  timestamp?: string;
  source?: EventSource;
};

export type StoredEvent = EventPayload & {
  id: string;
  createdAt: string;
};
