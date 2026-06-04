const FRAME_PREFIX = '@agentuity/explorer-frame ';

const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*m/g;

export interface SandboxOutputFrame {
	readonly type: 'stdout';
	readonly data: string;
}

function stripTransportDecorations(content: string): string {
	return content
		.replace(ANSI_ESCAPE_REGEX, '')
		.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z[ \t]*/gm, '');
}

function cleanOutput(content: string): string {
	return stripTransportDecorations(content).replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

export function encodeSandboxOutputFrame(frame: SandboxOutputFrame): string {
	return `${FRAME_PREFIX}${JSON.stringify(frame)}\n`;
}

export function parseSandboxOutputLine(line: string): SandboxOutputFrame | undefined {
	const cleaned = stripTransportDecorations(line);
	if (!cleaned.startsWith(FRAME_PREFIX)) return undefined;

	try {
		const parsed: unknown = JSON.parse(cleaned.slice(FRAME_PREFIX.length));
		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'type' in parsed &&
			parsed.type === 'stdout' &&
			'data' in parsed &&
			typeof parsed.data === 'string'
		) {
			return { type: 'stdout', data: parsed.data };
		}
	} catch {
		return undefined;
	}

	return undefined;
}

function extractProtocolPayload(content: string): {
	output: string;
	hasOutput: boolean;
} {
	const frames: string[] = [];

	for (const line of stripTransportDecorations(content).split(/\r?\n/)) {
		const frame = parseSandboxOutputLine(line);
		if (frame) frames.push(frame.data);
	}

	return {
		output: frames.join(''),
		hasOutput: frames.length > 0,
	};
}

export function extractOutputPayload(
	content: string,
	options: { allowUnmarkedFallback?: boolean } = {}
): string {
	const protocol = extractProtocolPayload(content);
	if (protocol.hasOutput) return protocol.output;

	return options.allowUnmarkedFallback ? cleanOutput(content) : '';
}
