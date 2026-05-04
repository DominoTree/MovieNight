import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { room } from '$lib/server/room';
import { getOrCreateSid } from '$lib/server/session';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const sid = getOrCreateSid(cookies);
	let body: { name?: string; color?: string };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'invalid json');
	}
	const result = room.join(sid, body.name ?? '', body.color ?? '');
	if (!result.ok) return json({ error: result.error }, { status: 400 });
	return json({ name: result.name, color: result.color });
};
