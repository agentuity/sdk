import { Hono } from 'hono';

const overlay = `<style>
#__dev_overlay {
  position: fixed;
  display: none;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0,0,0,0.65);
  z-index: 99999;
  cursor: wait;
}
</style>
<div id="__dev_overlay"></div>
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
		document.getElementById('__dev_overlay').style.display = 'block';
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
