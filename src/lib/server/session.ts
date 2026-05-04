import { randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';

const COOKIE = 'sid';
const SECURE = (process.env.ORIGIN ?? '').startsWith('https://');

export function getOrCreateSid(cookies: Cookies): string {
	let sid = cookies.get(COOKIE);
	if (!sid) {
		sid = randomBytes(16).toString('hex');
		cookies.set(COOKIE, sid, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: SECURE,
			maxAge: 60 * 60 * 24
		});
	}
	return sid;
}

export function getSid(cookies: Cookies): string | undefined {
	return cookies.get(COOKIE);
}
