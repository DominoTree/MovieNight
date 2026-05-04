// Server config from env. STREAM_KEY required for OBS publish auth.

export const STREAM_KEY = process.env.STREAM_KEY ?? '';
export const PUBLISH_PATH = process.env.PUBLISH_PATH ?? 'live';
export const HLS_URL = process.env.HLS_URL ?? '/hls/index.m3u8';
export const PAGE_TITLE = process.env.PAGE_TITLE ?? 'Movie Night';

// ADMIN_PASS gates privileged chat commands (/playing, /reloadplayer).
// Empty/unset = no admin tier; commands stay available to nobody.
export const ADMIN_PASS = process.env.ADMIN_PASS ?? '';

if (!STREAM_KEY) {
	console.warn('STREAM_KEY is empty; mediamtx publish auth will reject all streams');
}
if (!ADMIN_PASS) {
	console.warn('ADMIN_PASS is empty; /playing and /reloadplayer are disabled');
}
