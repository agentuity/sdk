import { expect, test } from 'bun:test';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dir, '..', 'send-webhook.sh');
const OK_BODY = JSON.stringify({
	status: 'ok',
	stats: { processed: 1, deleted: 0, errors: 0, errorFiles: [] },
});

interface FakeReceiver {
	url: string;
	requestCount: () => number;
	stop: () => void;
}

// Responds with the queued statuses in order, repeating the last one once the
// queue is exhausted. A 200 returns the canonical sync response body.
function startReceiver(statuses: number[]): FakeReceiver {
	let count = 0;
	const server = Bun.serve({
		port: 0,
		fetch() {
			const status = statuses[Math.min(count, statuses.length - 1)] ?? 500;
			count++;
			if (status === 200) {
				return new Response(OK_BODY, {
					status,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response('receiver unavailable', { status });
		},
	});
	return {
		url: `http://127.0.0.1:${server.port}`,
		requestCount: () => count,
		stop: () => server.stop(true),
	};
}

async function runSendWebhook(
	url: string,
	env: Record<string, string> = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(['bash', SCRIPT, url, 'Bearer test-token'], {
		env: { ...process.env, ...env },
		stdin: new TextEncoder().encode('{"repo":"agentuity/sdk","changed":[]}'),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { stdout, stderr, exitCode };
}

test('forwards the payload and prints only the receiver JSON response on stdout', async () => {
	const receiver = startReceiver([200]);
	try {
		const result = await runSendWebhook(receiver.url);
		expect(result.exitCode).toBe(0);
		// send-batched.sh parses stdout with jq, so it must stay pure JSON.
		expect(result.stdout.trim()).toBe(OK_BODY);
		expect(receiver.requestCount()).toBe(1);
	} finally {
		receiver.stop();
	}
});

test('rejects non-numeric retry env instead of silently disabling the backoff cap', async () => {
	const receiver = startReceiver([500, 500, 200]);
	try {
		const result = await runSendWebhook(receiver.url, {
			MAX_RETRIES: '3',
			RETRY_DELAY: '0',
			MAX_RETRY_DELAY: 'banana',
		});
		expect(result.exitCode).not.toBe(0);
		expect(receiver.requestCount()).toBe(0);
		expect(result.stderr).toContain('MAX_RETRY_DELAY');
	} finally {
		receiver.stop();
	}
});

test('rejects zero retries instead of skipping every request', async () => {
	const receiver = startReceiver([200]);
	try {
		const result = await runSendWebhook(receiver.url, {
			MAX_RETRIES: '0',
			RETRY_DELAY: '0',
		});
		expect(result.exitCode).not.toBe(0);
		expect(receiver.requestCount()).toBe(0);
		expect(result.stderr).toContain('MAX_RETRIES');
	} finally {
		receiver.stop();
	}
});

test('gives up immediately on a non-retryable 4xx instead of burning the retry budget', async () => {
	const receiver = startReceiver([400]);
	try {
		const result = await runSendWebhook(receiver.url, {
			MAX_RETRIES: '10',
			RETRY_DELAY: '0',
		});
		expect(result.exitCode).not.toBe(0);
		expect(receiver.requestCount()).toBe(1);
	} finally {
		receiver.stop();
	}
});

test(
	'caps exponential backoff at MAX_RETRY_DELAY',
	async () => {
		const receiver = startReceiver([500]);
		try {
			const result = await runSendWebhook(receiver.url, {
				MAX_RETRIES: '4',
				RETRY_DELAY: '1',
				MAX_RETRY_DELAY: '2',
			});
			expect(result.exitCode).not.toBe(0);
			expect(receiver.requestCount()).toBe(4);
			// Uncapped doubling would announce 1s, 2s, 4s; the cap holds it at 2s.
			expect(result.stderr).toContain('Retrying in 1s');
			expect(result.stderr.match(/Retrying in 2s/g)?.length).toBe(2);
			expect(result.stderr).not.toContain('Retrying in 4s');
		} finally {
			receiver.stop();
		}
	},
	{ timeout: 20000 }
);

test(
	'honors MAX_RETRIES and RETRY_DELAY env so sync survives a receiver outage longer than the default window',
	async () => {
		// Incident shape: receiver 500s while its own deployment rolls out, then
		// recovers. Four 500s exceeds the default 3-attempt budget.
		const receiver = startReceiver([500, 500, 500, 500, 200]);
		try {
			const result = await runSendWebhook(receiver.url, {
				MAX_RETRIES: '6',
				RETRY_DELAY: '0',
			});
			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe(OK_BODY);
			expect(receiver.requestCount()).toBe(5);
		} finally {
			receiver.stop();
		}
	},
	{ timeout: 20000 }
);
