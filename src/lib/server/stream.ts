// Polls the mediamtx control API to track whether a publisher is active on
// our path. The caller supplies a broadcaster (typically `room.broadcast`) so
// this module stays decoupled from the room and avoids an import cycle.

import { PUBLISH_PATH, STREAM_KEY } from './config.js';
import type { ServerMessage } from '../protocol.js';

const MEDIAMTX_API = process.env.MEDIAMTX_API ?? '127.0.0.1:9997';
// Slow safety-net poll. Real-time updates come from mediamtx hooks
// (publish-auth and runOnNotReady) hitting setLive() directly.
const POLL_MS = 30_000;
const TARGET_PATH = `${PUBLISH_PATH}/${STREAM_KEY}`;

let live = false;
let timer: NodeJS.Timeout | null = null;
let broadcast: (msg: ServerMessage) => void = () => {};

async function probe(): Promise<boolean> {
	try {
		const res = await fetch(`http://${MEDIAMTX_API}/v3/paths/get/${TARGET_PATH}`, {
			signal: AbortSignal.timeout(2_000)
		});
		if (!res.ok) return false;
		const body = (await res.json()) as { ready?: boolean; source?: unknown };
		return Boolean(body.ready && body.source);
	} catch {
		return false;
	}
}

function emit(next: boolean, source: string) {
	if (next === live) return;
	live = next;
	broadcast({ type: 'stream', data: { live } });
	console.log(`[stream] state -> ${live ? 'live' : 'offline'} (${source})`);
}

async function tick() {
	emit(await probe(), 'poll');
}

export function isLive(): boolean {
	return live;
}

export function setLive(next: boolean, source = 'hook') {
	emit(next, source);
}

export function startStreamMonitor(b: (msg: ServerMessage) => void) {
	broadcast = b;
	if (timer) return;
	void tick();
	timer = setInterval(() => void tick(), POLL_MS);
}

export function stopStreamMonitor() {
	if (timer) clearInterval(timer);
	timer = null;
}
