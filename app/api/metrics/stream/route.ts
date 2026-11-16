import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api-guard';
import { collectSystemMetrics } from '@/lib/system/metrics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const guard = await requireAuth(req);
  if (!guard.ok) return guard.response;

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendSnapshot = async () => {
        if (closed) return;
        try {
          const metrics = await collectSystemMetrics();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(metrics)}\n\n`)
          );
        } catch {
          // Abaikan error sementara saat stream ditutup
        }
      };

      await sendSnapshot();
      timer = setInterval(sendSnapshot, 3000);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
