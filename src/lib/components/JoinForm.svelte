<script lang="ts">
	import { joinChat } from '$lib/state.svelte';
	import { randomColor } from '$lib/colors';

	let name = $state('');
	let color = $state(loadColor());
	let error = $state('');
	let busy = $state(false);

	function loadColor(): string {
		if (typeof document === 'undefined') return randomColor();
		const m = document.cookie.match(/(?:^|; )mn_color=([^;]+)/);
		return m ? decodeURIComponent(m[1]) : randomColor();
	}

	function saveColor(c: string) {
		document.cookie = `mn_color=${encodeURIComponent(c)}; path=/; max-age=31536000; samesite=strict`;
	}

	async function submit(e: Event) {
		e.preventDefault();
		if (busy) return;
		const trimmed = name.trim();
		if (!trimmed) {
			error = 'Enter a name.';
			return;
		}
		busy = true;
		error = '';
		const result = await joinChat(trimmed, color);
		busy = false;
		if (!result.ok) {
			error = result.error;
			return;
		}
		saveColor(color);
	}

	function reroll() {
		color = randomColor();
	}
</script>

<form class="join" onsubmit={submit}>
	<h2>Join chat</h2>
	<label>
		<span>Name</span>
		<input
			type="text"
			bind:value={name}
			maxlength="36"
			autocomplete="username"
			autocapitalize="off"
			autocorrect="off"
			spellcheck="false"
		/>
	</label>
	<label class="color">
		<span>Color</span>
		<input type="color" bind:value={color} />
		<button type="button" onclick={reroll}>random</button>
	</label>
	{#if error}<p class="error">{error}</p>{/if}
	<button type="submit" disabled={busy}>{busy ? 'Joining...' : 'Join'}</button>
</form>

<style>
	.join {
		display: flex;
		flex-direction: column;
		gap: 0.75em;
		padding: 1.5em;
		background: var(--popout);
		border-radius: 8px;
		max-width: 320px;
		margin: 2em auto;
		color: var(--fg);
	}
	h2 {
		margin: 0;
		text-align: center;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25em;
		font-size: 12px;
	}
	label.color {
		flex-direction: row;
		align-items: center;
		gap: 0.5em;
	}
	label.color > span {
		flex: 1;
	}
	input[type='text'] {
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 8px;
		color: var(--fg);
		font-size: 16px;
		font-family: inherit;
	}
	input[type='color'] {
		width: 36px;
		height: 36px;
		border: 1px solid var(--border);
		background: transparent;
		padding: 0;
	}
	button {
		background: #232328;
		color: var(--fg);
		border: none;
		border-radius: 4px;
		padding: 10px;
		font-weight: bold;
		font-family: inherit;
		cursor: pointer;
		min-height: 44px;
	}
	button:hover:not(:disabled) {
		background: #46464f;
	}
	button:disabled {
		opacity: 0.5;
		cursor: progress;
	}
	.error {
		color: #e82222;
		margin: 0;
		text-align: center;
		font-size: 12px;
	}
</style>
