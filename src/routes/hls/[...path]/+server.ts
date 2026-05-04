import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STREAM_KEY, PUBLISH_PATH } from '$lib/server/config';

const MEDIAMTX_HLS = process.env.MEDIAMTX_HLS ?? '127.0.0.1:8888';

// Proxy /hls/<file>[?...] -> http://<MEDIAMTX_HLS>/<PUBLISH_PATH>/<STREAM_KEY>/<file>[?...]
// Hides the stream key from the browser.

export const GET: RequestHandler = async ({ params, request, url }) => {
	if (!STREAM_KEY) throw error(503, 'no stream key configured');

	const sub = params.path?.length ? params.path : 'index.m3u8';
	const target = `http://${MEDIAMTX_HLS}/${PUBLISH_PATH}/${STREAM_KEY}/${sub}${url.search}`;

	const headers = new Headers();
	for (const h of ['range', 'cookie', 'if-none-match', 'if-modified-since']) {
		const v = request.headers.get(h);
		if (v) headers.set(h, v);
	}

	let res: Response;
	try {
		res = await fetch(target, {
			headers,
			redirect: 'manual',
			signal: AbortSignal.timeout(15_000)
		});
	} catch (err) {
		console.warn('[hls] upstream fetch failed', err);
		throw error(502, 'upstream unreachable');
	}

	// mediamtx redirects to a path-with-cookie. Rewrite Location so the stream
	// key prefix becomes "/hls" instead of "/<PUBLISH_PATH>/<STREAM_KEY>".
	const out = new Headers();
	for (const [k, v] of res.headers) {
		const lk = k.toLowerCase();
		if (lk === 'content-length' || lk === 'content-encoding' || lk === 'transfer-encoding') continue;
		out.append(k, v);
	}
	const loc = out.get('location');
	if (loc) {
		const prefix = `/${PUBLISH_PATH}/${STREAM_KEY}`;
		if (loc.startsWith(prefix)) {
			out.set('location', '/hls' + loc.slice(prefix.length));
		}
	}

	return new Response(res.body, { status: res.status, headers: out });
};
