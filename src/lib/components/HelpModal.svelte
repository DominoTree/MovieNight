<script lang="ts">
	import Modal from './Modal.svelte';

	let { onclose }: { onclose: () => void } = $props();

	const userCmds: { cmd: string; desc: string }[] = [
		{ cmd: '/me <text>', desc: 'Emote-style action message.' },
		{ cmd: '/nick <name>', desc: 'Change your nickname.' },
		{ cmd: '/users', desc: 'List users in chat.' },
		{ cmd: '/emotes', desc: 'Show all available emotes.' },
		{ cmd: '/reload', desc: 'Reload your video player.' },
		{ cmd: '/help', desc: 'Show this help.' },
		{ cmd: '/auth <password>', desc: 'Authenticate as admin.' }
	];
	const adminCmds: { cmd: string; desc: string }[] = [
		{
			cmd: '/playing [title] [https://link]',
			desc: 'Set or clear the now-playing title and optional link.'
		}
	];
</script>

<Modal title="Commands" {onclose}>
	<section>
		<h3>Everyone</h3>
		<dl>
			{#each userCmds as c (c.cmd)}
				<dt>{c.cmd}</dt>
				<dd>{c.desc}</dd>
			{/each}
		</dl>
	</section>
	<section>
		<h3>Admin</h3>
		<dl>
			{#each adminCmds as c (c.cmd)}
				<dt>{c.cmd}</dt>
				<dd>{c.desc}</dd>
			{/each}
		</dl>
	</section>
	<p class="hint">
		Tip: type <code>:</code> to autocomplete emotes, <code>@</code> to autocomplete user names.
		Wrap text in <code>||spoiler||</code> to hide it until clicked.
	</p>
</Modal>

<style>
	section {
		margin-bottom: 16px;
	}
	h3 {
		margin: 0 0 8px;
		font-size: 13px;
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 4px 16px;
		margin: 0;
		font-size: 13px;
	}
	dt {
		font-family: 'Hack', monospace;
		color: var(--fg);
		font-weight: bold;
	}
	dd {
		margin: 0;
		color: #cfccd1;
	}
	.hint {
		font-size: 12px;
		color: #888;
		border-top: 1px solid var(--border);
		padding-top: 12px;
		margin: 12px 0 0;
	}
	code {
		background: rgba(255, 255, 255, 0.08);
		padding: 1px 4px;
		border-radius: 3px;
	}
</style>
