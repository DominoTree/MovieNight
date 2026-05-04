<script lang="ts">
	import Modal from './Modal.svelte';
	import { chat } from '$lib/state.svelte';

	let { onclose }: { onclose: () => void } = $props();

	const sorted = $derived(Object.entries(chat.emotes).sort(([a], [b]) => a.localeCompare(b)));
</script>

<Modal title="Emotes ({sorted.length})" {onclose}>
	{#if sorted.length === 0}
		<p class="empty">No emotes loaded.</p>
	{:else}
		<div class="grid">
			{#each sorted as [code, url] (code)}
				<figure>
					<img src={url} alt={code} loading="lazy" />
					<figcaption><code>:{code}:</code></figcaption>
				</figure>
			{/each}
		</div>
	{/if}
</Modal>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 12px;
	}
	figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px;
		background: rgba(0, 0, 0, 0.25);
		border-radius: 6px;
	}
	figure img {
		max-width: 96px;
		max-height: 96px;
		object-fit: contain;
	}
	figcaption {
		font-size: 11px;
		text-align: center;
		word-break: break-all;
	}
	code {
		background: transparent;
		color: var(--accent);
		font-family: 'Hack', monospace;
	}
	.empty {
		text-align: center;
		color: #888;
	}
</style>
