// Client chat state. Uses Svelte 5 runes.

import type {
	ChatMessage,
	ChatEvent,
	ChatCommand,
	ServerMessage
} from './protocol';

export type RenderableMessage =
	| { id: number; kind: 'chat'; data: ChatMessage; ts: number }
	| { id: number; kind: 'event'; data: ChatEvent; ts: number };

const STORAGE_KEY = 'mn_session';

interface StoredSession {
	name: string;
	color: string;
}

function loadSession(): StoredSession | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed?.name === 'string' && typeof parsed?.color === 'string') {
			return parsed;
		}
	} catch {
		// ignore
	}
	return null;
}

function saveSession(s: StoredSession) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
	} catch {
		// ignore
	}
}

function clearSession() {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

const preloadedEmoteUrls = new Set<string>();

function preloadEmotes(urls: string[]) {
	if (typeof Image === 'undefined') return;
	for (const url of urls) {
		if (preloadedEmoteUrls.has(url)) continue;
		preloadedEmoteUrls.add(url);
		const img = new Image();
		img.decoding = 'async';
		img.loading = 'eager';
		img.src = url;
	}
}

class ChatState {
	messages = $state<RenderableMessage[]>([]);
	users = $state<string[]>([]);
	emotes = $state<Record<string, string>>({});
	playing = $state<{ title: string; link: string }>({ title: '', link: '' });
	self = $state<{ name: string; color: string } | null>(null);
	notice = $state<string>('');
	connected = $state<boolean>(false);
	streamLive = $state<boolean>(false);
	maxMessages = 200;

	private nextId = 1;
	private es: EventSource | null = null;
	private playerHooks = new Set<() => void>();
	private rejoining = false;

	connect() {
		if (this.es) return;
		this.es = new EventSource('/api/events');
		this.es.onopen = () => {
			this.connected = true;
		};
		this.es.onmessage = (ev) => {
			try {
				this.handle(JSON.parse(ev.data) as ServerMessage);
			} catch (e) {
				console.warn('bad SSE payload', e, ev.data);
			}
		};
		this.es.addEventListener('unauth', () => {
			this.disconnect();
			this.handleUnauth();
		});
		this.es.onerror = () => {
			this.connected = false;
			// EventSource auto-reconnects on transient errors. If the server
			// has restarted and dropped session state, the reconnect will hit
			// the unauth event above.
		};
	}

	disconnect() {
		this.es?.close();
		this.es = null;
		this.connected = false;
	}

	onReloadPlayer(fn: () => void): () => void {
		this.playerHooks.add(fn);
		return () => this.playerHooks.delete(fn);
	}

	reloadPlayer() {
		for (const fn of this.playerHooks) fn();
	}

	async tryRestore(): Promise<boolean> {
		const stored = loadSession();
		if (!stored) return false;
		const result = await joinChat(stored.name, stored.color);
		return result.ok;
	}

	private async handleUnauth() {
		if (this.rejoining) return;
		this.rejoining = true;
		try {
			const stored = loadSession();
			if (!stored) {
				this.notice = 'Session expired. Refresh to rejoin.';
				this.self = null;
				return;
			}
			const result = await joinChat(stored.name, stored.color);
			if (!result.ok) {
				this.notice = `Reconnect failed: ${result.error}`;
				this.self = null;
				clearSession();
			} else {
				this.notice = '';
			}
		} finally {
			this.rejoining = false;
		}
	}

	private handle(msg: ServerMessage) {
		switch (msg.type) {
			case 'chat':
				this.push({ id: this.nextId++, kind: 'chat', data: msg.data, ts: Date.now() });
				return;
			case 'event':
				this.push({ id: this.nextId++, kind: 'event', data: msg.data, ts: Date.now() });
				return;
			case 'users':
				this.users = msg.data;
				return;
			case 'emotes':
				this.emotes = msg.data;
				preloadEmotes(Object.values(msg.data));
				return;
			case 'joined':
				this.self = msg.data;
				saveSession(msg.data);
				return;
			case 'stream':
				this.streamLive = msg.data.live;
				return;
			case 'backlog':
				for (const entry of msg.data) {
					if (entry.kind === 'chat') {
						this.push({ id: this.nextId++, kind: 'chat', data: entry.data, ts: entry.ts });
					} else {
						this.push({ id: this.nextId++, kind: 'event', data: entry.data, ts: entry.ts });
					}
				}
				return;
			case 'command':
				this.handleCommand(msg.data);
				return;
			case 'error':
				this.notice = msg.data;
				return;
		}
	}

	private handleCommand(cmd: ChatCommand) {
		switch (cmd.command) {
			case 'playing':
				this.playing = { title: cmd.args[0] ?? '', link: cmd.args[1] ?? '' };
				return;
			case 'purge-chat':
				this.messages = [];
				return;
		}
	}

	private push(msg: RenderableMessage) {
		const next = [...this.messages, msg];
		if (next.length > this.maxMessages) next.splice(0, next.length - this.maxMessages);
		this.messages = next;
	}
}

export const chat = new ChatState();

export async function joinChat(name: string, color: string): Promise<{ ok: true } | { ok: false; error: string }> {
	const res = await fetch('/api/join', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ name, color })
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		return { ok: false, error: body.error ?? `HTTP ${res.status}` };
	}
	saveSession({ name, color });
	chat.connect();
	return { ok: true };
}

export async function sendChat(text: string) {
	if (!text) return;
	await fetch('/api/msg', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text })
	});
}

export async function leaveChat() {
	chat.disconnect();
	clearSession();
	await fetch('/api/leave', { method: 'POST' });
}
