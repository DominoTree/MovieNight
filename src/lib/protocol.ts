// Wire protocol shared between client and server.
// Server -> Client: ServerMessage
// Client -> Server: ClientMessage

export type ServerMessage =
	| { type: 'chat'; data: ChatMessage }
	| { type: 'event'; data: ChatEvent }
	| { type: 'command'; data: ChatCommand }
	| { type: 'users'; data: string[] }
	| { type: 'emotes'; data: Record<string, string> }
	| { type: 'joined'; data: { name: string; color: string } }
	| { type: 'stream'; data: { live: boolean } }
	| { type: 'backlog'; data: BacklogEntry[] }
	| { type: 'error'; data: string };

export type BacklogEntry =
	| { kind: 'chat'; ts: number; data: ChatMessage }
	| { kind: 'event'; ts: number; data: ChatEvent };

export type ClientMessage =
	| { type: 'join'; name: string; color: string }
	| { type: 'msg'; text: string }
	| { type: 'ping' };

export interface ChatMessage {
	from: string;
	color: string;
	text: string;
	kind: MessageKind;
}

export type MessageKind = 'chat' | 'action' | 'system' | 'error' | 'notice';

export interface ChatEvent {
	event: EventKind;
	user: string;
	color: string;
	users?: string[];
	from?: string;
}

export type EventKind = 'join' | 'leave' | 'name-change';

export interface ChatCommand {
	command: CommandKind;
	args: string[];
}

export type CommandKind = 'playing' | 'purge-chat';
