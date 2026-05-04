<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Hls from 'hls.js';
	import { chat } from '$lib/state.svelte';

	let video: HTMLVideoElement | undefined = $state();
	let overlayVisible = $state(false);
	let errorMsg = $state('');
	let session: { destroy: () => void } | null = null;

	async function tryPlay(el: HTMLVideoElement) {
		// Try unmuted first; browser autoplay policy may reject. On rejection,
		// fall back to muted autoplay and surface an unmute prompt.
		el.muted = false;
		try {
			await el.play();
			overlayVisible = false;
			return;
		} catch {
			el.muted = true;
			overlayVisible = true;
			try {
				await el.play();
			} catch (err) {
				console.warn('play() rejected even when muted', err);
			}
		}
	}

	const HLS_URL = '/hls/index.m3u8';

	function destroy() {
		try {
			session?.destroy();
		} catch (e) {
			console.warn('player destroy err', e);
		}
		session = null;
	}

	function start() {
		destroy();
		errorMsg = '';
		if (!video) return;

		video.removeAttribute('src');
		try {
			video.load();
		} catch {
			// noop
		}

		const native = video.canPlayType('application/vnd.apple.mpegurl') !== '';
		if (native) {
			startNative();
			return;
		}
		if (Hls.isSupported()) {
			startHls();
			return;
		}
		errorMsg = 'Browser does not support live video playback.';
	}

	function startNative() {
		if (!video) return;
		const el = video;
		let killed = false;
		const onErr = () => {
			if (killed) return;
			console.warn('native HLS error');
		};
		el.addEventListener('error', onErr);
		el.src = HLS_URL;
		void tryPlay(el);
		session = {
			destroy() {
				killed = true;
				el.removeEventListener('error', onErr);
				el.removeAttribute('src');
				try {
					el.load();
				} catch {
					// noop
				}
			}
		};
	}

	function startHls() {
		if (!video) return;
		const el = video;
		const hls = new Hls({
			lowLatencyMode: true,
			liveDurationInfinity: true,
			backBufferLength: 30,
			maxBufferLength: 10
		});
		hls.on(Hls.Events.ERROR, (_, data) => {
			if (!data.fatal) return;
			console.warn('hls.js fatal', data.type, data.details);
			if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
				hls.recoverMediaError();
			}
			// Other fatals: server-side stream monitor will tell us when the
			// stream is back; tear down for now to stop spamming the network.
		});
		hls.loadSource(HLS_URL);
		hls.attachMedia(el);
		void tryPlay(el);
		session = {
			destroy() {
				try {
					hls.destroy();
				} catch (e) {
					console.warn('hls.destroy err', e);
				}
			}
		};
	}

	function unmute() {
		if (!video) return;
		overlayVisible = false;
		video.muted = false;
	}

	let unhook: (() => void) | null = null;
	onMount(() => {
		unhook = chat.onReloadPlayer(() => {
			if (chat.streamLive) start();
		});
	});
	onDestroy(() => {
		unhook?.();
		destroy();
	});

	$effect(() => {
		if (chat.streamLive) {
			// Defer to after the <video> element renders.
			queueMicrotask(start);
		} else {
			destroy();
			overlayVisible = true;
		}
	});
</script>

<div class="wrap">
	{#if !chat.streamLive}
		<div class="status">
			<div class="status-text">No stream</div>
			<div class="status-sub">Waiting for someone to start streaming…</div>
		</div>
	{:else}
		{#if overlayVisible}
			<button
				class="overlay"
				type="button"
				aria-label="Tap to unmute"
				onclick={unmute}
				onkeydown={(e) => e.key === 'Enter' && unmute()}
			>
				<span>🔇 tap to unmute</span>
			</button>
		{/if}
		<video
			bind:this={video}
			playsinline
			controlslist="nodownload"
			autoplay
			controls
			onvolumechange={() => { if (video && !video.muted) overlayVisible = false; }}
		>
			Your browser does not support HTML5 video.
		</video>
		{#if errorMsg}
			<div class="err">{errorMsg}</div>
		{/if}
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		display: flex;
		width: 100%;
		height: 100%;
		background: #000;
	}
	video {
		width: 100%;
		height: 100%;
		max-height: 100%;
		object-fit: contain;
		background: #000;
	}
	.overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 3;
		border: none;
		font-size: 1.5em;
		cursor: pointer;
		font-family: inherit;
	}
	.err {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		background: #000;
		z-index: 4;
		text-align: center;
		padding: 1em;
	}
	.status {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		color: #cfccd1;
		text-align: center;
		padding: 1em;
		gap: 0.5em;
	}
	.status-text {
		font-size: 2em;
		font-weight: bold;
		color: var(--accent);
	}
	.status-sub {
		font-size: 0.9em;
		opacity: 0.6;
	}
</style>
