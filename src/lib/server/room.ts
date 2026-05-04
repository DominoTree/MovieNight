import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import type {
	BacklogEntry,
	ChatMessage,
	ClientMessage,
	ServerMessage
} from '../protocol.js';
import { normalizeColor, randomColor } from './colors.js';
import { isValidName, normalizeName } from './names.js';
import { getEmotes } from './emotes.js';
import { ADMIN_PASS } from './config.js';
import { isLive } from './stream.js';

type Send = (msg: ServerMessage) => void;

interface Member {
	sid: string;
	name: string;
	color: string;
	send: Send | null; // null = no active SSE connection
	pendingLeave: NodeJS.Timeout | null;
	admin: boolean; // server-side only, never serialized to other clients
	authFails: number;
	authLockUntil: number; // epoch ms; 0 = unlocked
}

const REJOIN_GRACE_MS = 10_000;
const AUTH_LOCKOUT_MS = 30_000;
const AUTH_MAX_FAILS = 5;
const BACKLOG_MAX = 10;

class Room {
	private bySid = new Map<string, Member>();
	private playing = '';
	private playingLink = '';
	private backlog: BacklogEntry[] = [];

	get(sid: string): Member | undefined {
		return this.bySid.get(sid);
	}

	join(sid: string, rawName: string, rawColor: string): { ok: true; name: string; color: string } | { ok: false; error: string } {
		const name = normalizeName(rawName);
		if (!isValidName(name)) {
			return { ok: false, error: 'Invalid name. Letters, digits, _ and - only (1-36 chars).' };
		}
		const lower = name.toLowerCase();

		const existing = this.bySid.get(sid);
		if (existing) {
			// Same session re-joining (refresh). Allow rename if free.
			if (existing.name.toLowerCase() !== lower && this.nameTaken(lower, sid)) {
				return { ok: false, error: 'Name already taken.' };
			}
			existing.name = name;
			existing.color = normalizeColor(rawColor) ?? existing.color;
			return { ok: true, name: existing.name, color: existing.color };
		}

		if (this.nameTaken(lower, sid)) {
			return { ok: false, error: 'Name already taken.' };
		}

		const color = normalizeColor(rawColor) ?? randomColor();
		const member: Member = {
			sid,
			name,
			color,
			send: null,
			pendingLeave: null,
			admin: false,
			authFails: 0,
			authLockUntil: 0
		};
		this.bySid.set(sid, member);
		this.broadcast({ type: 'event', data: { event: 'join', user: name, color } });
		this.broadcast({ type: 'users', data: this.names() });
		return { ok: true, name, color };
	}

	attach(sid: string, send: Send): boolean {
		const member = this.bySid.get(sid);
		if (!member) return false;
		if (member.pendingLeave) {
			clearTimeout(member.pendingLeave);
			member.pendingLeave = null;
		}
		member.send = send;
		send({ type: 'joined', data: { name: member.name, color: member.color } });
		send({ type: 'emotes', data: getEmotes() });
		send({ type: 'users', data: this.names() });
		send({ type: 'stream', data: { live: isLive() } });
		if (this.backlog.length > 0) {
			send({ type: 'backlog', data: this.backlog });
		}
		if (this.playing) {
			send({
				type: 'command',
				data: { command: 'playing', args: [this.playing, this.playingLink] }
			});
		}
		return true;
	}

	detach(sid: string) {
		const member = this.bySid.get(sid);
		if (!member) return;
		member.send = null;
		// Allow brief reconnect window before announcing leave.
		member.pendingLeave = setTimeout(() => this.leave(sid), REJOIN_GRACE_MS);
	}

	leave(sid: string) {
		const member = this.bySid.get(sid);
		if (!member) return;
		if (member.pendingLeave) clearTimeout(member.pendingLeave);
		this.bySid.delete(sid);
		this.broadcast({
			type: 'event',
			data: { event: 'leave', user: member.name, color: member.color }
		});
		this.broadcast({ type: 'users', data: this.names() });
	}

	handle(sid: string, msg: ClientMessage) {
		const member = this.bySid.get(sid);
		if (!member) return;
		switch (msg.type) {
			case 'msg':
				this.handleMsg(member, msg.text);
				return;
			case 'ping':
				return;
		}
	}

	private handleMsg(member: Member, raw: string) {
		const text = raw.replace(/[\r\n\t​]+/g, ' ').trim().slice(0, 400);
		if (!text) return;

		if (text.startsWith('/')) {
			this.runCommand(member, text.slice(1));
			return;
		}
		this.broadcastChat({ from: member.name, color: member.color, text, kind: 'chat' });
	}

	private runCommand(member: Member, cmd: string) {
		// Split on first space only — preserves passwords/titles with embedded spaces.
		const sp = cmd.indexOf(' ');
		const name = (sp === -1 ? cmd : cmd.slice(0, sp)).toLowerCase();
		const rest = sp === -1 ? '' : cmd.slice(sp + 1);
		const args = rest.length ? rest.split(' ') : [];

		switch (name) {
			case 'auth':
				this.handleAuth(member, rest);
				return;
			case 'me': {
				const text = rest.trim();
				if (text) {
					this.broadcastChat({
						from: member.name,
						color: member.color,
						text,
						kind: 'action'
					});
				}
				return;
			}
			case 'playing': {
				if (!this.requireAdmin(member)) return;
				if (args.length === 0) {
					this.playing = '';
					this.playingLink = '';
				} else {
					const titleParts: string[] = [];
					let link = '';
					for (const word of args) {
						if (word.startsWith('http://') || word.startsWith('https://')) {
							link = word;
						} else {
							titleParts.push(word);
						}
					}
					this.playing = titleParts.join(' ').trim();
					this.playingLink = link;
				}
				this.broadcast({
					type: 'command',
					data: { command: 'playing', args: [this.playing, this.playingLink] }
				});
				return;
			}
			case 'users':
				this.toMember(member, {
					type: 'chat',
					data: { from: '', color: '', text: `Users: ${this.names().join(', ')}`, kind: 'notice' }
				});
				return;
			case 'nick':
				this.handleNick(member, args[0] ?? '');
				return;
			default:
				this.toMember(member, {
					type: 'chat',
					data: { from: '', color: '', text: `Unknown command: ${name}`, kind: 'error' }
				});
		}
	}

	private handleNick(member: Member, rawName: string) {
		const name = normalizeName(rawName);
		if (!isValidName(name)) {
			this.toMember(member, {
				type: 'chat',
				data: {
					from: '',
					color: '',
					text: 'Invalid name. Letters, digits, _ and - only (1-36 chars).',
					kind: 'error'
				}
			});
			return;
		}
		const lower = name.toLowerCase();
		if (member.name.toLowerCase() === lower) {
			// Same name (possibly different case). Apply case change without broadcasting.
			if (member.name !== name) {
				member.name = name;
				this.toMember(member, { type: 'joined', data: { name: member.name, color: member.color } });
			}
			return;
		}
		if (this.nameTaken(lower, member.sid)) {
			this.toMember(member, {
				type: 'chat',
				data: { from: '', color: '', text: 'Name already taken.', kind: 'error' }
			});
			return;
		}
		const oldName = member.name;
		member.name = name;
		this.toMember(member, { type: 'joined', data: { name: member.name, color: member.color } });
		this.broadcast({
			type: 'event',
			data: { event: 'name-change', user: member.name, color: member.color, from: oldName }
		});
		this.broadcast({ type: 'users', data: this.names() });
	}

	private handleAuth(member: Member, password: string) {
		if (!ADMIN_PASS) {
			this.toMember(member, {
				type: 'chat',
				data: { from: '', color: '', text: 'Admin auth disabled on this server.', kind: 'error' }
			});
			return;
		}
		const now = Date.now();
		if (member.authLockUntil > now) {
			const wait = Math.ceil((member.authLockUntil - now) / 1000);
			this.toMember(member, {
				type: 'chat',
				data: {
					from: '',
					color: '',
					text: `Too many attempts. Try again in ${wait}s.`,
					kind: 'error'
				}
			});
			return;
		}
		// Constant-time compare. Use SHA-256 hashes so length doesn't leak via
		// the timing-safe equality (which requires same-length buffers).
		const ok = constantTimeStringEq(password, ADMIN_PASS);
		if (ok) {
			member.admin = true;
			member.authFails = 0;
			member.authLockUntil = 0;
			this.toMember(member, {
				type: 'chat',
				data: { from: '', color: '', text: 'You are now an admin.', kind: 'notice' }
			});
			console.log(`[auth] ${member.name} authenticated as admin`);
			return;
		}
		member.authFails++;
		if (member.authFails >= AUTH_MAX_FAILS) {
			member.authLockUntil = now + AUTH_LOCKOUT_MS;
			member.authFails = 0;
		}
		this.toMember(member, {
			type: 'chat',
			data: { from: '', color: '', text: 'Authentication failed.', kind: 'error' }
		});
		console.log(`[auth] ${member.name} failed auth (${member.authFails} fails)`);
	}

	private requireAdmin(member: Member): boolean {
		if (member.admin) return true;
		this.toMember(member, {
			type: 'chat',
			data: { from: '', color: '', text: 'Admin only.', kind: 'error' }
		});
		return false;
	}

	private nameTaken(lower: string, exceptSid: string): boolean {
		for (const m of this.bySid.values()) {
			if (m.sid !== exceptSid && m.name.toLowerCase() === lower) return true;
		}
		return false;
	}

	private names(): string[] {
		return Array.from(this.bySid.values(), (m) => m.name).sort();
	}

	private broadcastChat(msg: ChatMessage) {
		this.broadcast({ type: 'chat', data: msg });
	}

	broadcast(msg: ServerMessage) {
		this.recordBacklog(msg);
		for (const m of this.bySid.values()) {
			if (m.send) m.send(msg);
		}
	}

	private toMember(member: Member, msg: ServerMessage) {
		if (member.send) member.send(msg);
	}

	private recordBacklog(msg: ServerMessage) {
		let entry: BacklogEntry | null = null;
		if (msg.type === 'chat') {
			entry = { kind: 'chat', ts: Date.now(), data: msg.data };
		} else if (msg.type === 'event') {
			entry = { kind: 'event', ts: Date.now(), data: msg.data };
		}
		if (!entry) return;
		this.backlog.push(entry);
		if (this.backlog.length > BACKLOG_MAX) {
			this.backlog.splice(0, this.backlog.length - BACKLOG_MAX);
		}
	}
}

function constantTimeStringEq(a: string, b: string): boolean {
	// Hash both sides so timingSafeEqual sees fixed-length (SHA-256 = 32-byte)
	// buffers regardless of input length, eliminating length-based timing leaks.
	const ab = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	if (ab.length === 0 || bb.length === 0) return false;
	const ha = createHash('sha256').update(ab).digest();
	const hb = createHash('sha256').update(bb).digest();
	return timingSafeEqual(ha, hb);
}

export const room = new Room();
