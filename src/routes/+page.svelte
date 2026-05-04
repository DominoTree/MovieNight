<script lang="ts">
	import { onMount } from 'svelte';
	import { chat } from '$lib/state.svelte';
	import JoinForm from '$lib/components/JoinForm.svelte';
	import Player from '$lib/components/Player.svelte';
	import Chat from '$lib/components/Chat.svelte';

	let restoring = $state(true);
	const joined = $derived(chat.self !== null);

	onMount(async () => {
		await chat.tryRestore();
		restoring = false;
	});
</script>

<svelte:head>
	<title>{chat.playing.title ? `Movie Night | ${chat.playing.title}` : 'Movie Night'}</title>
</svelte:head>

<main class:joined>
	{#if !joined}
		<div class="join-wrap">
			{#if restoring}
				<p class="loading">Connecting…</p>
			{:else}
				<JoinForm />
			{/if}
		</div>
	{:else}
		<div class="player"><Player /></div>
		<aside class="chat"><Chat /></aside>
	{/if}
</main>

<style>
	main {
		height: 100vh;
		display: grid;
	}
	main.joined {
		grid-template-columns: 5fr 1fr;
	}
	.player {
		min-height: 0;
		min-width: 0;
		background: #000;
	}
	.chat {
		min-height: 0;
		min-width: 280px;
		border-left: 1px solid var(--border);
	}

	.join-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
	}

	.loading {
		color: var(--accent);
		font-weight: bold;
	}

	@media (max-width: 900px) and (orientation: landscape) {
		main.joined {
			grid-template-columns: 2fr 1fr;
		}
	}

	@media (max-width: 768px) {
		main.joined {
			grid-template-columns: 1fr;
			grid-template-rows: 56.25vw 1fr;
		}
		.chat {
			border-left: none;
			border-top: 1px solid var(--border);
		}
	}
</style>
