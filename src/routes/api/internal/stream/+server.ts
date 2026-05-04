import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setLive } from '$lib/server/stream';

// Internal endpoint hit by mediamtx hooks (runOnReady / runOnNotReady).
// Body: {"live": true|false}. Public access blocked at nginx
// (location /api/internal/ → 404). The X-Forwarded-For header is set by
// nginx for proxied requests, so its absence indicates the request did not
// pass through nginx and is therefore jail-local.

export const POST: RequestHandler = async ({ request }) => {
	if (request.headers.get('x-forwarded-for')) {
		throw error(403, 'forbidden');
	}
	let body: { live?: boolean };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'bad json');
	}
	if (typeof body.live !== 'boolean') throw error(400, 'live missing');
	setLive(body.live, 'mediamtx-hook');
	return json({ ok: true });
};
