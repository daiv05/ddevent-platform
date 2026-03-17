type DashboardEvent = {
  id: string;
  eventName: string;
  source: string;
  createdAt: string;
};

type EventsResponse = {
  events: DashboardEvent[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};

async function fetchEvents(): Promise<EventsResponse | null> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  const dashboardApiKey = process.env.DEVENT_DASHBOARD_API_KEY;

  if (!apiBase || !dashboardApiKey) {
    return null;
  }

  const response = await fetch(`${apiBase}/events?page=1&pageSize=50`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${dashboardApiKey}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch events. Status: ${response.status}`);
  }

  return (await response.json()) as EventsResponse;
}

export default async function EventsPage() {
  const payload = await fetchEvents();

  if (!payload) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <div className="mx-auto w-full max-w-4xl rounded-xl border border-amber-500/40 bg-amber-500/10 p-6">
          <h1 className="text-2xl font-semibold text-amber-200">Dashboard not configured</h1>
          <p className="mt-3 text-sm text-amber-100">
            Set NEXT_PUBLIC_API_URL and DEVENT_DASHBOARD_API_KEY in dashboard environment variables to
            load events.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">Events</p>
            <h1 className="text-3xl font-semibold">Latest ingested events</h1>
          </div>
          <p className="text-sm text-slate-300">Total: {payload.pagination.total}</p>
        </header>

        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-900 text-slate-300">
              <tr>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Created at</th>
                <th className="px-4 py-3 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              {payload.events.map((event) => (
                <tr key={event.id} className="border-t border-slate-800">
                  <td className="px-4 py-3 font-medium text-slate-100">{event.eventName}</td>
                  <td className="px-4 py-3 text-slate-300">{event.source}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{event.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
