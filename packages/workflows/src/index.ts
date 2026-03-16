export type WorkflowOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists';

export type WorkflowCondition = {
  field: string;
  operator: WorkflowOperator;
  value?: string;
};

export type WorkflowAction = {
  type: 'webhook' | 'send_email' | 'slack' | 'discord' | 'integration';
  [key: string]: unknown;
};

export type WorkflowRule = {
  id: string;
  tenantId: string;
  name: string;
  triggerEvent: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  isActive: boolean;
};

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export function matchesConditions(
  payload: Record<string, unknown>,
  conditions: WorkflowCondition[]
): boolean {
  return conditions.every((condition) => {
    const currentValue = getNestedValue(payload, condition.field);

    switch (condition.operator) {
      case 'eq':
        return String(currentValue) === String(condition.value ?? '');
      case 'neq':
        return String(currentValue) !== String(condition.value ?? '');
      case 'gt':
        return Number(currentValue) > Number(condition.value ?? 0);
      case 'lt':
        return Number(currentValue) < Number(condition.value ?? 0);
      case 'contains':
        return String(currentValue ?? '').includes(String(condition.value ?? ''));
      case 'exists':
        return currentValue !== undefined && currentValue !== null;
      default:
        return false;
    }
  });
}
