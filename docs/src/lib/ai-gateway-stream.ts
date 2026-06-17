import { AIGatewayClient } from '@agentuity/aigateway';
import {
	getAIGatewayStreamDeltaText,
	type AIGatewayChatCompletionParams,
	type AIGatewayResponseMetadata,
} from '@agentuity/aigateway';

export interface AIGatewayTextStream {
	textStream: AsyncIterable<string>;
	metadata: Promise<AIGatewayResponseMetadata>;
}

export async function streamAIGatewayText(
	params: AIGatewayChatCompletionParams
): Promise<AIGatewayTextStream> {
	const gateway = new AIGatewayClient();
	const completion = await gateway.streamRequest({
		path: '/',
		body: { ...params, stream: true },
	});

	return {
		textStream: decodeAIGatewayTextStream(completion.stream),
		metadata: completion.metadata,
	};
}

export async function* decodeAIGatewayTextStream(
	stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let finished = false;

	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) {
				finished = true;
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const frames = buffer.split(/\r?\n\r?\n/u);
			buffer = frames.pop() ?? '';

			for (const frame of frames) {
				const text = readAIGatewayFrameText(frame);
				if (text) yield text;
			}
		}

		buffer += decoder.decode();
		const text = readAIGatewayFrameText(buffer);
		if (text) yield text;
	} finally {
		if (!finished) {
			await reader.cancel();
		}
		reader.releaseLock();
	}
}

export function totalTokensFromAIGatewayMetadata(metadata: AIGatewayResponseMetadata): number {
	const promptTokens = metadata.cost?.promptTokens ?? 0;
	const completionTokens = metadata.cost?.completionTokens ?? 0;
	return promptTokens + completionTokens;
}

function readAIGatewayFrameText(frame: string): string {
	const data = frame
		.split(/\r?\n/u)
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(5).trimStart())
		.join('\n')
		.trim();

	if (!data || data === '[DONE]') return '';

	try {
		return getAIGatewayStreamDeltaText(JSON.parse(data));
	} catch {
		return '';
	}
}
