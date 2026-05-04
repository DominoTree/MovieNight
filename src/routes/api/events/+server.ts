import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { room } from '$lib/server/room';
import { getSid } from '$lib/server/session';
import type { ServerMessage } from '$lib/protocol';

const KEEPALIVE_MS = 25_000;

export const GET: RequestHandler = ({ cookies }) => {
	const sid = getSid(cookies);
	if (!sid) throw error(401, 'no session');

	let send: (m: ServerMessage) => void = () => {};
	let keepalive: ReturnType<typeof setInterval> | null = null;
	let attached = false;

	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			send = (msg) => {
				try {
					controller.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
				} catch {
					// stream closed
				}
			};
			attached = room.attach(sid, send);
			if (!attached) {
				controller.enqueue(enc.encode(`event: unauth\ndata: \n\n`));
				controller.close();
				return;
			}
			keepalive = setInterval(() => {
				try {
					controller.enqueue(enc.encode(`: ping\n\n`));
				} catch {
					// closed
				}
			}, KEEPALIVE_MS);
		},
		cancel() {
			if (keepalive) clearInterval(keepalive);
			if (attached) room.detach(sid);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'X-Accel-Buffering': 'no',
			Connection: 'keep-alive'
		}
	});
};
