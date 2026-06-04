import { expect, test } from 'bun:test';
import { createSandboxOutputForwarder } from '../sandbox/output-forwarder';
import { encodeSandboxOutputFrame, extractOutputPayload } from '../../lib/sandbox-output-protocol';

function createRecorder() {
	const events: { event: string; data: string }[] = [];
	const stream = {
		async writeSSE(event: { event: string; data: string }): Promise<void> {
			events.push(event);
		},
	};
	const output = (): string =>
		events
			.filter((event) => event.event === 'stdout')
			.map((event) => event.data.replace(/\\n/g, '\n'))
			.join('');

	return { events, output, stream };
}

test('sandbox output forwarder parses structured frames split across chunks', async () => {
	const recorder = createRecorder();
	const forwarder = createSandboxOutputForwarder(recorder.stream);
	const payload = 'hello\nliteral ---OUTPUT--- text\nstill payload';
	const frame = encodeSandboxOutputFrame({ type: 'stdout', data: payload });

	forwarder.push(`bun noise before frame\n${frame.slice(0, 22)}`);
	forwarder.push(frame.slice(22));
	forwarder.push('logger noise after frame\n');
	await forwarder.flush();

	expect(recorder.output()).toBe(payload);
	expect(recorder.output()).toContain('literal ---OUTPUT--- text');
	expect(recorder.output()).not.toContain('logger noise');
});

test('sandbox output forwarder does not flush unframed output as stdout', async () => {
	const recorder = createRecorder();
	const forwarder = createSandboxOutputForwarder(recorder.stream);

	forwarder.push('2026-01-01T00:00:00.000000000Z stderr noise before a crash');
	await forwarder.flush();

	expect(recorder.events).toHaveLength(0);
	expect(forwarder.hasOutput()).toBe(false);
});

test('sandbox output forwarder parses multiple frames without payload delimiters', async () => {
	const recorder = createRecorder();
	const forwarder = createSandboxOutputForwarder(recorder.stream);

	forwarder.push(encodeSandboxOutputFrame({ type: 'stdout', data: 'first' }));
	forwarder.push(encodeSandboxOutputFrame({ type: 'stdout', data: '\nsecond' }));
	await forwarder.flush();

	expect(recorder.output()).toBe('first\nsecond');
	expect(forwarder.hasOutput()).toBe(true);
});

test('extractOutputPayload prefers structured frames over unframed fallback', () => {
	const frame = encodeSandboxOutputFrame({
		type: 'stdout',
		data: 'real output with ---OUTPUT--- inside it',
	});

	expect(extractOutputPayload('logger noise only')).toBe('');
	expect(extractOutputPayload('logger noise only', { allowUnmarkedFallback: true })).toBe(
		'logger noise only'
	);
	expect(extractOutputPayload(`noise\n${frame}noise`, { allowUnmarkedFallback: true })).toBe(
		'real output with ---OUTPUT--- inside it'
	);
});

test('extractOutputPayload ignores frame prefixes embedded in log lines', () => {
	const frame = encodeSandboxOutputFrame({ type: 'stdout', data: 'real output' });

	expect(extractOutputPayload(`logger ${frame}`)).toBe('');
});
