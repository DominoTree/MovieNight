import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		// Behind nginx, the Host header is whatever the public domain is.
		// Vite blocks unknown hosts by default; allow all so reverse-proxy works.
		allowedHosts: true,
		// HMR over the same public port as the page; nginx must forward
		// Upgrade/Connection headers for the WebSocket.
		hmr: {
			clientPort: 443,
			protocol: 'wss'
		},
		// FreeBSD fs.watch is unreliable under jails; poll for changes.
		watch: {
			usePolling: true,
			interval: 500
		}
	}
});
