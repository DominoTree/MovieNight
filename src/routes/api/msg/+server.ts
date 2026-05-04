import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { room } from '$lib/server/room';
import { getSid } from '$lib/server/session';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sid = getSid(cookies);
	if (!sid) throw error(401, 'no session');
	let body: { text?: string };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid json');
	}
	const text = body.text ?? '';
	room.handle(sid, { type: 'msg', text });
	return json({ ok: true });
};
