import { describe, expect, test } from 'bun:test';
import { decodeAIGatewayTextStream } from '../ai-gateway-stream';

const encoder = new TextEncoder();

function sseStream(text: string): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(text));
			controller.close();
		},
	});
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string> {
	let text = '';
	for await (const chunk of decodeAIGatewayTextStream(stream)) {
		text += chunk;
	}
	return text;
}

describe('decodeAIGatewayTextStream', () => {
	test('extracts OpenAI-compatible chat deltas', async () => {
		const text = await collect(
			sseStream(
				'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n' +
					'data: {"choices":[{"delta":{"content":"world"}}]}\n\n' +
					'data: [DONE]\n\n'
			)
		);

		expect(text).toBe('Hello world');
	});

	test('extracts Responses, Anthropic, and Google stream deltas', async () => {
		const text = await collect(
			sseStream(
				'data: {"type":"response.output_text.delta","delta":"A"}\n\n' +
					'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"B"}}\n\n' +
					'data: {"candidates":[{"content":{"parts":[{"text":"C"}]}}]}\n\n'
			)
		);

		expect(text).toBe('ABC');
	});
});
