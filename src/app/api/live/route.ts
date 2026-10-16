import { connection } from 'next/server';
import prisma from '@/lib/prisma';

const CHECK_EVERY_MS = 1500;
const PING_EVERY_MS = 15_000;

/** A cheap fingerprint of "has anything changed?" across links and visits. */
async function dataVersion() {
  const [visits, links, pages] = await Promise.all([
    prisma.visit.aggregate({ _count: true, _max: { createdAt: true } }),
    prisma.link.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.pageSession.aggregate({ _count: true, _max: { updatedAt: true } }),
  ]);
  return [
    visits._count,
    visits._max.createdAt?.getTime() ?? 0,
    links._count,
    links._max.updatedAt?.getTime() ?? 0,
    pages._count,
    pages._max.updatedAt?.getTime() ?? 0,
  ].join('.');
}

/**
 * Server-Sent Events stream. Sends the current data version on connect and
 * again whenever it changes; clients refetch when they see a new version.
 * Polling the DB here (rather than an in-memory event bus) keeps it correct
 * even when several server processes share one database.
 */
export async function GET(request: Request) {
  await connection();
  const encoder = new TextEncoder();
  const signal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream already closed by the client.
        }
      };

      send(`retry: 3000\n\n`);
      let last = '';
      let lastSent = Date.now();
      let failures = 0;

      while (!signal.aborted) {
        try {
          const version = await dataVersion();
          if (version !== last) {
            last = version;
            lastSent = Date.now();
            send(`data: ${version}\n\n`);
          } else if (Date.now() - lastSent > PING_EVERY_MS) {
            // Comment line keeps proxies from closing an idle connection.
            lastSent = Date.now();
            send(`: ping\n\n`);
          }
        } catch (error) {
          // Log once per connection, not every tick — e.g. a stale Prisma client after a schema
          // change fails the same way each time until the dev server is restarted.
          if (failures++ === 0) {
            console.error('live: version check failed (restart the server if you just changed the database schema)', error);
          }
          // Back off so a broken connection doesn't hammer the database.
          await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, failures * CHECK_EVERY_MS)));
        }
        await new Promise((resolve) => setTimeout(resolve, CHECK_EVERY_MS));
      }
      try {
        controller.close();
      } catch {}
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
