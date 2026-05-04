<script lang="ts">
	import type { Segment } from '$lib/parse';

	let { segments }: { segments: Segment[] } = $props();

	function toggleSpoiler(e: MouseEvent) {
		(e.currentTarget as HTMLElement).classList.toggle('open');
	}
</script>

{#snippet renderSegs(segs: Segment[])}
	{#each segs as seg, i (i)}
		{#if seg.kind === 'text'}{seg.text}{/if}
		{#if seg.kind === 'emote'}
			<img class="emote" src={seg.url} alt={seg.code} title={seg.code} />
		{/if}
		{#if seg.kind === 'mention'}
			<span class="mention" class:self={seg.self}>@{seg.name}</span>
		{/if}
		{#if seg.kind === 'link'}
			<a class="link" href={seg.href} target="_blank" rel="noopener noreferrer">{seg.href}</a>
		{/if}
		{#if seg.kind === 'spoiler'}
			<button
				type="button"
				class="spoiler"
				onclick={toggleSpoiler}
				aria-label="Reveal spoiler"
			>{@render renderSegs(seg.segments)}</button>
		{/if}
	{/each}
{/snippet}

{@render renderSegs(segments)}

<style>
	.emote {
		max-height: 48px;
		vertical-align: middle;
	}
	.mention {
		background: #1cf67ed9;
		color: var(--bg);
		padding: 1px 2px;
		border-radius: 4px;
	}
	.mention.self {
		background: #ffeb3b;
	}
	.link {
		color: var(--link);
		word-break: break-all;
	}
	.spoiler {
		background: var(--popout);
		color: var(--popout);
		border-radius: 3px;
		padding: 0 3px;
		border: none;
		font: inherit;
		cursor: pointer;
	}
	:global(.spoiler.open) {
		background: var(--bg);
		color: var(--accent);
	}
</style>
