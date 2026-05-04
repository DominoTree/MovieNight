// Parse chat text into renderable segments. Client-side only.

export type Segment =
	| { kind: 'text'; text: string }
	| { kind: 'emote'; code: string; url: string }
	| { kind: 'mention'; name: string; self: boolean }
	| { kind: 'link'; href: string }
	| { kind: 'spoiler'; segments: Segment[] };

export interface ParseContext {
	emotes: Record<string, string>;
	selfName: string;
	users: string[];
}

const SPOILER_RE = /\|\|(.+?)\|\|/g;
const URL_RE = /\bhttps?:\/\/[^\s<>]+/g;
const WRAPPED_EMOTE_RE = /[:\[]([^\s:/\\?=#\][]+)[:\]]/g;

export function parseMessage(raw: string, ctx: ParseContext): Segment[] {
	return parseSpoilers(raw, ctx);
}

function parseSpoilers(input: string, ctx: ParseContext): Segment[] {
	const out: Segment[] = [];
	let last = 0;
	for (const m of input.matchAll(SPOILER_RE)) {
		const idx = m.index ?? 0;
		if (idx > last) out.push(...parseInline(input.slice(last, idx), ctx));
		out.push({ kind: 'spoiler', segments: parseInline(m[1], ctx) });
		last = idx + m[0].length;
	}
	if (last < input.length) out.push(...parseInline(input.slice(last), ctx));
	return out;
}

function parseInline(input: string, ctx: ParseContext): Segment[] {
	const out: Segment[] = [];
	const userLower = new Set(ctx.users.map((u) => u.toLowerCase()));
	const selfLower = ctx.selfName.toLowerCase();

	for (const word of splitKeepingSpaces(input)) {
		if (word.text.match(/^\s+$/)) {
			out.push({ kind: 'text', text: word.text });
			continue;
		}

		const t = word.text;

		// URL?
		if (URL_RE.test(t)) {
			URL_RE.lastIndex = 0;
			out.push({ kind: 'link', href: t });
			continue;
		}

		// Mention?
		if (t.startsWith('@')) {
			const nm = t.slice(1).replace(/[^A-Za-z0-9_-]/g, '');
			if (nm && userLower.has(nm.toLowerCase())) {
				out.push({ kind: 'mention', name: nm, self: nm.toLowerCase() === selfLower });
				continue;
			}
		}

		// Bare emote?
		if (ctx.emotes[t]) {
			out.push({ kind: 'emote', code: t, url: ctx.emotes[t] });
			continue;
		}

		// Wrapped emote(s) inside word?
		const sub = expandWrappedEmotes(t, ctx);
		out.push(...sub);
	}

	return mergeText(out);
}

function expandWrappedEmotes(word: string, ctx: ParseContext): Segment[] {
	const out: Segment[] = [];
	let last = 0;
	for (const m of word.matchAll(WRAPPED_EMOTE_RE)) {
		const idx = m.index ?? 0;
		const code = m[1];
		const url = ctx.emotes[code];
		if (!url) continue;
		if (idx > last) out.push({ kind: 'text', text: word.slice(last, idx) });
		out.push({ kind: 'emote', code, url });
		last = idx + m[0].length;
	}
	if (last < word.length) out.push({ kind: 'text', text: word.slice(last) });
	if (out.length === 0) out.push({ kind: 'text', text: word });
	return out;
}

function splitKeepingSpaces(input: string): { text: string }[] {
	const out: { text: string }[] = [];
	let buf = '';
	let inSpace = false;
	for (const ch of input) {
		const isSp = /\s/.test(ch);
		if (isSp !== inSpace) {
			if (buf) out.push({ text: buf });
			buf = ch;
			inSpace = isSp;
		} else {
			buf += ch;
		}
	}
	if (buf) out.push({ text: buf });
	return out;
}

function mergeText(segs: Segment[]): Segment[] {
	const out: Segment[] = [];
	for (const s of segs) {
		const last = out[out.length - 1];
		if (s.kind === 'text' && last && last.kind === 'text') {
			last.text += s.text;
		} else {
			out.push(s);
		}
	}
	return out;
}
