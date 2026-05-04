import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

const EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function resolveEmotesDir(): string {
	if (process.env.EMOTES_DIR) return process.env.EMOTES_DIR;
	const candidates = [
		join(process.cwd(), 'static', 'emotes'),
		join(process.cwd(), 'build', 'client', 'emotes'),
		join(process.cwd(), 'client', 'emotes')
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return candidates[0];
}

const EMOTES_DIR = resolveEmotesDir();

let emotes: Record<string, string> = {};
let loaded = false;

function load() {
	const map: Record<string, string> = {};
	try {
		walk(EMOTES_DIR, '', map);
	} catch (err) {
		console.error('Failed to load emotes:', err);
	}
	emotes = map;
	loaded = true;
	console.log(`Loaded ${Object.keys(emotes).length} emotes from ${EMOTES_DIR}`);
}

function walk(root: string, sub: string, map: Record<string, string>) {
	const dir = sub ? join(root, sub) : root;
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const rel = sub ? `${sub}/${name}` : name;
		const st = statSync(full);
		if (st.isDirectory()) {
			walk(root, rel, map);
			continue;
		}
		const ext = extname(name).toLowerCase();
		if (!EXTS.has(ext)) continue;
		const code = basename(name, ext);
		const url = `/emotes/${rel}`;
		let key = code;
		let n = 0;
		while (key in map) {
			n++;
			key = `${code}-${n}`;
		}
		map[key] = url;
	}
}

export function getEmotes(): Record<string, string> {
	if (!loaded) load();
	return emotes;
}
