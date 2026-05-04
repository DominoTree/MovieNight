import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { room } from '$lib/server/room';
import { getSid } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	const sid = getSid(cookies);
	if (sid) room.leave(sid);
	return json({ ok: true });
};
