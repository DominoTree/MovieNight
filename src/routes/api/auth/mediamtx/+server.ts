import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STREAM_KEY, PUBLISH_PATH } from '$lib/server/config';
import { setLive } from '$lib/server/stream';

interface MediamtxAuth {
	user?: string;
	password?: string;
	ip?: string;
	action?: string;
	path?: string;
	protocol?: string;
	id?: string;
	query?: string;
}

export const POST: RequestHandler = async ({ request }) => {
	let body: MediamtxAuth;
	try {
		body = await request.json();
	} catch {
		return new Response('bad json', { status: 400 });
	}
	if (body.action !== 'publish') return json({ ok: true });

	const path = body.path ?? '';
	const parts = path.split('/');
	if (parts.length !== 2 || parts[0] !== PUBLISH_PATH || !parts[1]) {
		console.log(`[publish] denied: bad path ${path} from ${body.ip}`);
		return new Response('bad path', { status: 401 });
	}
	if (parts[1] !== STREAM_KEY) {
		console.log(`[publish] denied: bad stream key from ${body.ip}`);
		return new Response('bad key', { status: 401 });
	}
	console.log(`[publish] accepted from ${body.ip} for path ${path}`);
	setLive(true, 'publish-auth');
	return json({ ok: true });
};
