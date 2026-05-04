<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		onclose,
		children
	}: { title: string; onclose: () => void; children: Snippet } = $props();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="backdrop"
	role="presentation"
	onclick={onclose}
	onkeydown={(e) => e.key === 'Enter' && onclose()}
></div>
<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
	<header>
		<h2 id="modal-title">{title}</h2>
		<button class="close" type="button" onclick={onclose} aria-label="Close">×</button>
	</header>
	<div class="body scrollbar">
		{@render children()}
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 50;
	}
	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--popout);
		color: var(--fg);
		border-radius: 8px;
		min-width: 320px;
		max-width: min(960px, 95vw);
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		z-index: 51;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}
	h2 {
		margin: 0;
		font-size: 16px;
	}
	.close {
		background: transparent;
		border: none;
		color: var(--fg);
		font-size: 24px;
		cursor: pointer;
		padding: 0 8px;
		line-height: 1;
	}
	.close:hover {
		color: var(--accent);
	}
	.body {
		padding: 16px;
		overflow-y: auto;
		min-height: 0;
	}
</style>
