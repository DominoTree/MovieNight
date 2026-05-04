<script lang="ts">
	import { tick } from 'svelte';
	import { chat, sendChat } from '$lib/state.svelte';
	import { parseMessage } from '$lib/parse';
	import { fuzzyFilter } from '$lib/fuzzy';
	import Message from './Message.svelte';
	import HelpModal from './HelpModal.svelte';
	import EmotesModal from './EmotesModal.svelte';

	let showHelp = $state(false);
	let showEmotes = $state(false);

	let msgInput = $state('');
	let textarea: HTMLTextAreaElement;
	let scroller: HTMLDivElement;
	let suggestionsEl: HTMLDivElement | undefined = $state();
	let stickyBottom = true;

	$effect(() => {
		// Re-read messages length to trigger scroll-to-bottom.
		void chat.messages.length;
		if (!stickyBottom) return;
		tick().then(() => {
			if (scroller) scroller.scrollTop = scroller.scrollHeight;
		});
	});

	$effect(() => {
		// Scroll selected suggestion into view as user navigates with arrow keys.
		void suggestionIdx;
		if (!suggestionsEl) return;
		tick().then(() => {
			const sel = suggestionsEl?.querySelector<HTMLElement>('button.selected');
			sel?.scrollIntoView({ block: 'nearest' });
		});
	});

	function onScroll() {
		const dist = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
		stickyBottom = dist < 50;
	}

	function focusInput(e: MouseEvent) {
		if (!textarea) return;
		const t = e.target as HTMLElement | null;
		if (t?.closest('button, a, input, textarea, select, label')) return;
		const sel = window.getSelection();
		if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
		textarea.focus();
	}

	async function send() {
		const text = msgInput.trim();
		if (!text) return;
		msgInput = '';
		await tick();
		autosize();
		// Client-side commands that don't go to the server.
		const lower = text.toLowerCase();
		if (lower === '/help' || lower === '/commands') {
			showHelp = true;
			textarea.focus();
			return;
		}
		if (lower === '/emotes') {
			showEmotes = true;
			textarea.focus();
			return;
		}
		if (lower === '/reload') {
			chat.reloadPlayer();
			textarea.focus();
			return;
		}
		await sendChat(text);
		textarea.focus();
	}

	function autosize() {
		if (!textarea) return;
		textarea.style.height = 'auto';
		const max = Math.max(60, Math.floor(window.innerHeight * 0.4));
		textarea.style.height = Math.min(textarea.scrollHeight, max) + 'px';
	}

	let suggestions = $state<string[]>([]);
	let suggestionType = $state<'emote' | 'name' | null>(null);
	let suggestionIdx = $state(0);

	function updateSuggestions() {
		if (!textarea) return;
		const val = textarea.value;
		const start = textarea.selectionStart;
		const before = val.slice(0, start);
		const m = before.match(/[:@]([\w-]*)$/);
		if (!m) {
			suggestions = [];
			suggestionType = null;
			return;
		}
		const trigger = m[0][0];
		const partial = m[1];
		if (trigger === '@') {
			suggestionType = 'name';
			const others = chat.users.filter((n) => n !== chat.self?.name);
			suggestions = fuzzyFilter(partial, others).slice(0, 50);
		} else {
			suggestionType = 'emote';
			suggestions = fuzzyFilter(partial, Object.keys(chat.emotes));
		}
		suggestionIdx = suggestions.length > 0 ? 0 : 0;
	}

	function applySuggestion(idx: number) {
		const choice = suggestions[idx];
		if (!choice) return;
		const val = textarea.value;
		const start = textarea.selectionStart;
		const before = val.slice(0, start);
		const after = val.slice(start);
		const m = before.match(/([:@])([\w-]*)$/);
		if (!m) return;
		const trigger = m[1];
		const replace = trigger === '@' ? `@${choice} ` : `:${choice}: `;
		const newBefore = before.slice(0, before.length - m[0].length) + replace;
		msgInput = newBefore + after;
		const pos = newBefore.length;
		tick().then(() => {
			textarea.setSelectionRange(pos, pos);
			textarea.focus();
		});
		suggestions = [];
		suggestionType = null;
	}

	function onKeydown(e: KeyboardEvent) {
		if (suggestions.length > 0) {
			if (e.key === 'Escape') {
				suggestions = [];
				suggestionType = null;
				e.preventDefault();
				return;
			}
			if (e.key === 'ArrowUp') {
				suggestionIdx = Math.max(0, suggestionIdx - 1);
				e.preventDefault();
				return;
			}
			if (e.key === 'ArrowDown') {
				suggestionIdx = Math.min(suggestions.length - 1, suggestionIdx + 1);
				e.preventDefault();
				return;
			}
			if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
				applySuggestion(suggestionIdx);
				e.preventDefault();
				return;
			}
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	function onInput() {
		autosize();
		updateSuggestions();
	}

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	function fmtTime(ts: number): string {
		const d = new Date(ts);
		return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	const ctx = $derived({
		emotes: chat.emotes,
		selfName: chat.self?.name ?? '',
		users: chat.users
	});

	const playingHref = $derived(chat.playing.link || null);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="chat" onclick={focusInput}>
	{#if chat.playing.title}
		{#if playingHref}
			<a class="playing" href={playingHref} target="_blank" rel="noopener noreferrer">
				{chat.playing.title}
			</a>
		{:else}
			<div class="playing">{chat.playing.title}</div>
		{/if}
	{/if}

	<div class="toolbar">
		<span class="users">{chat.users.length} online</span>
		<div class="actions">
			<button type="button" onclick={() => chat.reloadPlayer()} title="Reload your video player">Reload</button>
			<button type="button" onclick={() => (showEmotes = true)} title="Show emotes">Emotes</button>
			<button type="button" onclick={() => (showHelp = true)} title="Show commands">Help</button>
		</div>
	</div>

	<div
		class="messages scrollbar"
		bind:this={scroller}
		onscroll={onScroll}
		role="log"
		aria-live="polite"
	>
		{#each chat.messages as m (m.id)}
			<div class="msg" class:event={m.kind === 'event'}>
				{#if m.kind === 'chat'}
					<span class="time">{fmtTime(m.ts)}</span>
				{/if}
				{#if m.kind === 'event'}
					{@const e = m.data}
					{#if e.event === 'join'}
						<span class="ev">
							<span class="name" style="color:{e.color}">{e.user}</span> joined.
						</span>
					{:else if e.event === 'leave'}
						<span class="ev">
							<span class="name" style="color:{e.color}">{e.user}</span> left.
						</span>
					{:else if e.event === 'name-change'}
						<span class="ev">
							<span class="name" style="color:{e.color}">{e.from ?? ''}</span>
							is now known as
							<span class="name" style="color:{e.color}">{e.user}</span>.
						</span>
					{:else}
						<span class="ev">{e.user}</span>
					{/if}
				{:else if m.data.kind === 'action'}
					<span style="color:{m.data.color}">
						<span class="name">{m.data.from}</span>
						<span class="action">
							<Message segments={parseMessage(m.data.text, ctx)} />
						</span>
					</span>
				{:else if m.data.kind === 'system'}
					<span class="system"><Message segments={parseMessage(m.data.text, ctx)} /></span>
				{:else if m.data.kind === 'error'}
					<span class="error"><Message segments={parseMessage(m.data.text, ctx)} /></span>
				{:else if m.data.kind === 'notice'}
					<span class="notice"><Message segments={parseMessage(m.data.text, ctx)} /></span>
				{:else}
					<span class="name" style="color:{m.data.color}">{m.data.from}</span><b>:</b>
					<Message segments={parseMessage(m.data.text, ctx)} />
				{/if}
			</div>
		{/each}
	</div>

	<div class="msgbox">
		{#if suggestions.length > 0}
			<div class="suggestions scrollbar" role="listbox" bind:this={suggestionsEl}>
				{#each suggestions as s, i (s)}
					<button
						type="button"
						class:selected={i === suggestionIdx}
						onclick={() => applySuggestion(i)}
					>
						{#if suggestionType === 'emote'}
							<img class="emote" src={chat.emotes[s]} alt={s} />
						{/if}
						{s}
					</button>
				{/each}
			</div>
		{/if}
		<textarea
			bind:this={textarea}
			bind:value={msgInput}
			onkeydown={onKeydown}
			oninput={onInput}
			placeholder="Say something..."
			autocapitalize="off"
			spellcheck="true"
			rows="1"
		></textarea>
		<button class="send" type="button" onclick={send}>Send</button>
	</div>
</div>

{#if showHelp}
	<HelpModal onclose={() => (showHelp = false)} />
{/if}
{#if showEmotes}
	<EmotesModal onclose={() => (showEmotes = false)} />
{/if}

<style>
	.chat {
		display: flex;
		flex-direction: column;
		gap: 6px;
		height: 100%;
		min-height: 0;
		padding: 8px;
		color: var(--fg);
		font-size: 12px;
	}
	.playing {
		color: #288a85;
		font-size: 1.4em;
		font-weight: bold;
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: var(--accent);
	}
	.users {
		opacity: 0.7;
	}
	.toolbar .actions {
		display: flex;
		gap: 4px;
	}
	.toolbar .actions button {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--fg);
		font-family: inherit;
		font-size: 11px;
		padding: 3px 8px;
		cursor: pointer;
	}
	.toolbar .actions button:hover {
		background: var(--popout);
		color: var(--accent);
	}
	.messages {
		flex: 1 1 auto;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px;
		min-height: 0;
	}
	.msg {
		padding: 0.15em 0.4em;
		word-wrap: break-word;
	}
	.msg .name {
		font-weight: bold;
	}
	.msg .action {
		font-style: italic;
	}
	.msg.event .ev {
		font-style: italic;
		color: #8a8a92;
	}
	.msg .system {
		display: block;
		text-align: center;
		font-weight: bold;
		color: #ea6260;
		border-top: 2px solid #ea6260;
		border-bottom: 2px solid #ea6260;
		padding: 0.25em 0;
		margin: 0.25em 0;
	}
	.msg .error {
		color: #e82222;
		font-weight: bold;
	}
	.msg .notice {
		color: #888;
		font-size: 90%;
	}
	.msg .time {
		color: #6a6a72;
		font-size: 11px;
		margin-right: 4px;
	}
	.msgbox {
		position: relative;
		flex: 0 0 auto;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px;
	}
	textarea {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 6px;
		color: var(--fg);
		resize: none;
		font-family: inherit;
		font-size: 14px;
		outline: none;
	}
	textarea:focus,
	textarea:focus-visible {
		outline: none;
	}
	@media (max-width: 768px) {
		textarea {
			font-size: 16px;
		}
	}
	.send {
		background: #232328;
		color: var(--fg);
		border: none;
		border-radius: 4px;
		padding: 0 12px;
		font-weight: bold;
		font-family: inherit;
		cursor: pointer;
		min-width: 60px;
	}
	.send:hover {
		background: #46464f;
	}
	.suggestions {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 0;
		right: 0;
		background: #3b3b43;
		border-radius: 4px;
		max-height: 240px;
		overflow-y: auto;
		z-index: 10;
		display: flex;
		flex-direction: column;
	}
	.suggestions button {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		background: transparent;
		color: var(--fg);
		border: none;
		text-align: left;
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.suggestions button.selected,
	.suggestions button:hover {
		color: var(--accent);
		background: #4b4b53;
	}
	.suggestions .emote {
		max-height: 32px;
	}
</style>
