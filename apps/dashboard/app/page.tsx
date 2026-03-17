import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-20">
        <p className="text-xs uppercase tracking-[0.28em] text-emerald-300">Devent Dashboard</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
          Event pipeline status and tenant activity in one place
        </h1>
        <p className="max-w-2xl text-slate-300">
          This first dashboard cut provides direct visibility into ingested events so the API and worker
          flow can be validated quickly while product pages are built.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/events"
            className="rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
          >
            Open events
          </Link>
          <a
            href="http://localhost:3001/health"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
          >
            API health
          </a>
        </div>
      </section>
    </main>
  );
}
