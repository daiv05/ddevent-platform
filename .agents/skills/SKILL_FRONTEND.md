# SKILL_FRONTEND.md — Dashboard Frontend (apps/dashboard)

Use this skill when building any Next.js page, component, or data fetching logic inside `apps/dashboard`.

---

## 1. Stack

| Tool | Version | Purpose |
|---|---|---|
| Next.js | 16 (App Router) | Framework |
| TypeScript | 5 | Type safety |
| Tailwind CSS | v4 | Styling |
| shadcn/ui | latest | Component library |
| TanStack Query | v5 | Server state (async/remote data) |
| **Zod** | v3 | Schema validation (forms + API types) |
| **Redux Toolkit** | v2 | Global client state (UI, session, filters) |

All pages live in `apps/dashboard/app/` using the **App Router**.

---

## 2. Internal Package Usage

The dashboard can import from shared packages:

```typescript
import type { EventPayload, StoredEvent } from '@devent/events';
// Types only — no runtime logic from packages/events in the browser bundle
```

> ⚠️ The dashboard must NOT import from `@devent/database`, `@devent/queues`, or `@devent/workflows`.
> Those packages are server-side only. Only import **types** from `@devent/events` if needed.

---

## 3. Directory Structure (apps/dashboard)

```
apps/dashboard/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx               ← shell with sidebar
│   │   ├── page.tsx                 ← overview
│   │   ├── events/
│   │   │   ├── page.tsx             ← event log
│   │   │   └── [id]/page.tsx        ← event detail
│   │   ├── workflows/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── integrations/page.tsx
│   │   └── settings/
│   │       └── api-keys/page.tsx
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── ui/                          ← shadcn/ui primitives
│   ├── events/
│   ├── workflows/
│   ├── analytics/
│   └── layout/
├── lib/
│   ├── api.ts                       ← typed fetch wrapper
│   ├── types.ts                     ← local UI types
│   └── utils.ts
└── package.json
```

---

## 4. Typed API Client (lib/api.ts)

The dashboard calls `apps/api` — it never touches the DB or queues directly.

```typescript
// apps/dashboard/lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL!;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export const api = {
  events: {
    list:   (params?: Record<string, string>) =>
              apiFetch<EventsResponse>(`/events?${new URLSearchParams(params)}`),
    get:    (id: string) => apiFetch<DashboardEvent>(`/events/${id}`),
  },
  workflows: {
    list:   () => apiFetch<Workflow[]>('/workflows'),
    create: (data: CreateWorkflowInput) =>
              apiFetch<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Workflow>) =>
              apiFetch<Workflow>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => apiFetch<void>(`/workflows/${id}`, { method: 'DELETE' }),
  },
  analytics: {
    summary: () => apiFetch<AnalyticsSummary>('/analytics/summary'),
  },
};
```

---

## 5. Data Fetching with TanStack Query

Use **TanStack Query v5** for all server state. Never use `useState` + `useEffect` for async data.

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function EventsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['events'],
    queryFn: () => api.events.list(),
  });

  if (isLoading) return <EventListSkeleton />;
  if (error) return <ErrorMessage error={error as Error} />;
  return <EventTable events={data!.events} />;
}
```

### Query Key Conventions

```typescript
['events']                          // all events
['events', { page: 1 }]            // paginated
['events', 'detail', id]           // single event
['workflows']
['workflows', 'detail', id]
['analytics', 'summary']
```

---

## 6. Local UI Types (lib/types.ts)

Dashboard-local types that mirror API responses (do not import DB Prisma types):

```typescript
// apps/dashboard/lib/types.ts

export interface DashboardEvent {
  id: string;
  eventName: string;
  source: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Workflow {
  id: string;
  name: string;
  isActive: boolean;
  triggerEvent: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  createdAt: string;
}

export interface AnalyticsSummary {
  eventsToday: number;
  eventsLast7d: number;
  topEvents: { name: string; count: number }[];
}
```

---

## 7. Dashboard Pages (Build Order)

| Phase | Page | Path |
|---|---|---|
| 1 | Event log | `/events` |
| 1 | Event detail | `/events/[id]` |
| 1 | API Keys | `/settings/api-keys` |
| 2 | Workflows list | `/workflows` |
| 2 | Workflow builder | `/workflows/[id]` |
| 2 | Integrations | `/integrations` |
| 3 | Analytics | `/analytics` |
| 3 | Overview dashboard | `/` |

---

## 8. Component Guidelines

- Use **shadcn/ui** primitives (`Button`, `Table`, `Card`, `Dialog`, `Badge`).
- Domain components in `components/events/`, `components/workflows/`.
- Tailwind v4 utility classes — no inline styles, no CSS modules.
- Every interactive element must have a semantic `id`:
  ```tsx
  <Button id="btn-create-workflow">New Workflow</Button>
  ```

---

## 9. Zod — Form & Schema Validation

Use **Zod** for all form validation and for validating data returned from the API before it enters the UI.

### Form validation example

```typescript
// components/workflows/WorkflowForm.tsx
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const workflowSchema = z.object({
  name:         z.string().min(1, 'Name is required').max(100),
  triggerEvent: z.string().min(1, 'Trigger event is required'),
  conditions:   z.array(z.object({
    field:    z.string().min(1),
    operator: z.enum(['eq', 'neq', 'gt', 'lt', 'contains', 'exists']),
    value:    z.string(),
  })).default([]),
  actions: z.array(z.object({
    type: z.enum(['webhook', 'send_email', 'slack', 'discord', 'integration']),
  })).min(1, 'At least one action is required'),
});

type WorkflowFormValues = z.infer<typeof workflowSchema>;

export function WorkflowForm() {
  const form = useForm<WorkflowFormValues>({
    resolver: zodResolver(workflowSchema),
    defaultValues: { name: '', triggerEvent: '', conditions: [], actions: [] },
  });

  const onSubmit = async (values: WorkflowFormValues) => {
    await api.workflows.create(values);
  };

  // ...
}
```

### API response validation

Validate API responses at the boundary to catch shape mismatches early:

```typescript
// lib/schemas.ts
import { z } from 'zod';

export const DashboardEventSchema = z.object({
  id:        z.string(),
  eventName: z.string(),
  source:    z.string(),
  payload:   z.record(z.unknown()),
  createdAt: z.string(),
});

export const EventsResponseSchema = z.object({
  events: z.array(DashboardEventSchema),
  total:  z.number(),
});

// lib/api.ts (updated)
export const api = {
  events: {
    list: async (params?: Record<string, string>) => {
      const raw = await apiFetch<unknown>(`/events?${new URLSearchParams(params)}`);
      return EventsResponseSchema.parse(raw); // throws if shape is wrong
    },
  },
  // ...
};
```

> Define all Zod schemas in `lib/schemas.ts`. Use `z.infer<typeof Schema>` as the TypeScript type — never define both manually.

---

## 10. Redux Toolkit — Global Client State

Use **Redux Toolkit (RTK)** for client-side global state: UI state, session info, active filters, notification toasts, sidebar state, etc.

> **Rule:** Redux is for **client state**. TanStack Query is for **server state**. Never store API responses in Redux — that is TanStack Query's job.

### What goes in Redux

| Store slice | Examples |
|---|---|
| `sessionSlice` | Active tenant, user info, auth status |
| `uiSlice` | Sidebar open/closed, active theme, toast queue |
| `filtersSlice` | Event log filters, date ranges, pagination state |

### Store setup

```typescript
// lib/store.ts
import { configureStore } from '@reduxjs/toolkit';
import { sessionReducer } from './slices/sessionSlice';
import { uiReducer } from './slices/uiSlice';
import { filtersReducer } from './slices/filtersSlice';

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    ui:      uiReducer,
    filters: filtersReducer,
  },
});

export type RootState    = ReturnType<typeof store.getState>;
export type AppDispatch  = typeof store.dispatch;
```

```typescript
// lib/hooks.ts — typed hooks
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(selector: (state: RootState) => T) =>
  useSelector(selector);
```

### Example slice

```typescript
// lib/slices/filtersSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface FiltersState {
  eventName: string;
  dateRange: '24h' | '7d' | '30d';
  page: number;
}

const initialState: FiltersState = {
  eventName: '',
  dateRange: '7d',
  page: 1,
};

export const filtersSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    setEventName:  (state, action: PayloadAction<string>) => { state.eventName = action.payload; },
    setDateRange:  (state, action: PayloadAction<FiltersState['dateRange']>) => { state.dateRange = action.payload; },
    setPage:       (state, action: PayloadAction<number>) => { state.page = action.payload; },
    resetFilters:  () => initialState,
  },
});

export const { setEventName, setDateRange, setPage, resetFilters } = filtersSlice.actions;
export const filtersReducer = filtersSlice.reducer;
```

### Using filters with TanStack Query

```typescript
'use client';
import { useAppSelector } from '@/lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function EventList() {
  const { eventName, dateRange, page } = useAppSelector(s => s.filters);

  const { data } = useQuery({
    queryKey: ['events', { eventName, dateRange, page }],
    queryFn:  () => api.events.list({ eventName, dateRange, page: String(page) }),
  });

  // ...
}
```

### Provider setup

```tsx
// apps/dashboard/app/layout.tsx
import { Provider } from 'react-redux';
import { store } from '@/lib/store';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Provider store={store}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </Provider>
      </body>
    </html>
  );
}
```

---

## 11. Environment Variables

```env
# apps/dashboard/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Never expose `pk_live_*` API keys on the frontend. Dashboard uses session tokens, not project API keys.

---

## 12. Error Handling

```tsx
// components/ErrorMessage.tsx
export function ErrorMessage({ error }: { error: Error }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      Something went wrong: {error.message}
    </div>
  );
}
```

---

## 13. Running the Dashboard

```bash
# From monorepo root
turbo run dev --filter=dashboard

# Or from the app directory
cd apps/dashboard
npm run dev
```

---

## 14. What NOT to do

- ❌ Do NOT import `@devent/database` or `@devent/queues` in the dashboard — server-side only.
- ❌ Do NOT call `POST /events` from the dashboard — that endpoint is for SDK/client use.
- ❌ Do NOT hardcode the API URL — always use `NEXT_PUBLIC_API_URL`.
- ❌ Do NOT use `useEffect` + `useState` for async server data — use TanStack Query.
- ❌ Do NOT store API responses in Redux — use TanStack Query for server state.
- ❌ Do NOT define Prisma types locally — use the local `lib/types.ts` UI types + Zod schemas.
- ❌ Do NOT skip Zod validation on form submit — always use `zodResolver`.
- ❌ Do NOT put secret API keys in `NEXT_PUBLIC_*` env variables.
