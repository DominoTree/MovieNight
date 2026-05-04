import { room } from '$lib/server/room';
import { startStreamMonitor } from '$lib/server/stream';

let booted = false;
function boot() {
	if (booted) return;
	booted = true;
	startStreamMonitor((msg) => room.broadcast(msg));
}

boot();

export {};
