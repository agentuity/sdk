import { Hono } from 'hono';

const overlay = `
<div id="__dev_overlay">
	<svg
		aria-hidden="true"
		aria-label="Agentuity Logo"
		id="__dev_agentuity_logo"
		fill="none"
		height="191"
		viewBox="0 0 220 191"
		width="220"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			clip-rule="evenodd"
			d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
			fill="#0FF"
			fill-rule="evenodd"
		/>
		<path
			clip-rule="evenodd"
			d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
			fill="#0FF"
			fill-rule="evenodd"
		/>
	</svg>

	<svg
		aria-hidden="true"
		aria-label="Loading"
		id="__dev_loading_icon"
		fill="none"
		height="20"
		stroke="#FFF"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width="2"
		viewBox="0 0 24 24"
		width="20"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path d="M21 12a9 9 0 1 1-6.219-8.56" />
	</svg>
</div>

<style>
	@keyframes animate-in {
		from { opacity: 0; transform: translateY(10px); }
		to { opacity: 1; transform: translateY(0); }
	}
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
	#__dev_overlay {
		align-items: center;
		animation: animate-in 0.5s ease-in-out;
		background-color: #000;
		border: 1px solid #18181B;
		border-radius: 0.5rem;
		bottom: 1rem;
		box-shadow: 0 1.5rem 3rem -0.75rem #00000040;
		display: none;
		gap: 0.5rem;
		padding: 0.5rem;
		position: fixed;
		right: 1rem;
		z-index: 1000;
	}
	#__dev_overlay #__dev_agentuity_logo {
		height: auto;
		width: 1.5rem;
	}
	#__dev_overlay #__dev_loading_icon {
		animation: spin 1s linear infinite;
	}
</style>
`;

export function registerDevModeRoutes(router: Hono) {
	const controller = new AbortController();
	const signal = controller.signal;
	process.on('SIGINT', () => {
		controller.abort();
	});
	router.get('/__dev__/reload', () => {
		const stream = new ReadableStream({
			start(controller): void {
				signal.addEventListener('abort', () => {
					try {
						controller.enqueue('data: RELOAD\n\n');
					} catch {
						/* this is ok */
					}
					try {
						controller.close();
					} catch {
						/* this is ok */
					}
				});
			},
		});
		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
			},
		});
	});
	router.get('/__dev__/reload.js', (c) => {
		const body = `(() => {
    let reloading = false;
	const sleep = (t) => new Promise(resolve => setTimeout(resolve, t));
	const tryReload = () => {
		return new Promise(async (resolve) => {
			for (;;) {
				try {
					const res = await fetch('/');
					if (res.ok) {
						resolve();
						return;
					}
				} catch {
				}
				await sleep(250);
			}
		});
	};
	const showReload = () => {
        reloading = true;
		document.getElementById('__dev_overlay').style.display = 'flex';
	};
	const reloadPage = () => {
		reloading = false;
		tryReload().then(() => {
			location.reload();
			document.getElementById('__dev_overlay').style.display = 'none';
		});
	};
    const sse = new EventSource('/__dev__/reload');
    sse.onmessage = function(msg) {
		showReload();
        reloadPage();
    };
    sse.onopen = function() {
		showReload();
        reloadPage();
    };
	sse.onclose = function() {
		showReload();
	};
    window.addEventListener('beforeunload', () => sse.close());
})();
        `;
		return c.body(body, 200, { 'Content-Type': 'text/javascript' });
	});

	return overlay + '<script type="module" src="/__dev__/reload.js"></script>';
}
