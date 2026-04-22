const SHELL_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)$/;

export const AGENTUITY_CLI_MARK = '⨺';

type ToolArgsInput = string | Record<string, unknown> | undefined;

export interface ToolDisplayDescriptor {
	toolName: string;
	toolArgs?: string;
	fullLabel: string;
	branded: boolean;
}

function stripShellQuotes(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function tokenizeShellLike(command: string): string[] {
	return (command.match(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|&&|\|\||[;|()]|[^\s;|()]+/g) ?? []).map(
		stripShellQuotes
	);
}

function splitShellSegments(command: string): string[] {
	return command
		.split(/(?:\r?\n|&&|\|\||;|\|)/)
		.map((segment) => segment.trim())
		.filter(Boolean);
}

function optionConsumesValue(token: string): boolean {
	return (
		token === '-c' ||
		token === '-g' ||
		token === '-h' ||
		token === '-p' ||
		token === '-r' ||
		token === '-t' ||
		token === '-u' ||
		token === '--chdir' ||
		token === '--config' ||
		token === '--group' ||
		token === '--host' ||
		token === '--package' ||
		token === '--registry' ||
		token === '--user'
	);
}

function trimShellPrefix(tokens: string[]): string[] {
	let index = 0;

	while (index < tokens.length) {
		const token = tokens[index];
		if (!token || token === '!' || token === '(' || token === ')') {
			index += 1;
			continue;
		}

		if (token === 'env' || token === 'sudo') {
			index += 1;
			while (tokens[index]?.startsWith('-')) {
				const option = tokens[index] ?? '';
				index += optionConsumesValue(option) ? 2 : 1;
			}
			continue;
		}

		if (SHELL_ASSIGNMENT_PATTERN.test(token)) {
			index += 1;
			continue;
		}

		break;
	}

	return tokens.slice(index);
}

function extractAgentuityCliRemainderFromTokens(tokens: string[]): string | null {
	const trimmed = trimShellPrefix(tokens);
	if (trimmed.length === 0) return null;

	const first = trimmed[0]?.toLowerCase();
	if (first === 'agentuity') {
		return trimmed.slice(1).join(' ').trim();
	}

	if (first === 'bunx' || first === 'npx') {
		let index = 1;
		while (trimmed[index]?.startsWith('-')) {
			const option = trimmed[index] ?? '';
			index += optionConsumesValue(option) ? 2 : 1;
		}
		if (trimmed[index] === '@agentuity/cli') {
			return trimmed
				.slice(index + 1)
				.join(' ')
				.trim();
		}
	}

	if (first === 'pnpm' && trimmed[1]?.toLowerCase() === 'dlx') {
		let index = 2;
		while (trimmed[index]?.startsWith('-')) {
			const option = trimmed[index] ?? '';
			index += optionConsumesValue(option) ? 2 : 1;
		}
		if (trimmed[index] === '@agentuity/cli') {
			return trimmed
				.slice(index + 1)
				.join(' ')
				.trim();
		}
	}

	return null;
}

function normalizeDisplayWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function trimDisplay(value: string, max: number): string {
	const normalized = normalizeDisplayWhitespace(value);
	if (normalized.length <= max) return normalized;
	return `${normalized.slice(0, max - 3)}...`;
}

function getCommandArg(rawArgs?: ToolArgsInput): string | undefined {
	if (typeof rawArgs === 'string' && rawArgs.trim()) {
		return rawArgs.trim();
	}

	if (!rawArgs || typeof rawArgs !== 'object') {
		return undefined;
	}

	const value = rawArgs.command ?? rawArgs.cmd;
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getGenericToolArgsPreview(rawArgs?: ToolArgsInput): string | undefined {
	if (typeof rawArgs === 'string' && rawArgs.trim()) {
		return trimDisplay(rawArgs.trim(), 60);
	}

	if (!rawArgs || typeof rawArgs !== 'object') {
		return undefined;
	}

	if (typeof rawArgs.command === 'string' && rawArgs.command.trim()) {
		return trimDisplay(rawArgs.command.trim(), 60);
	}
	if (typeof rawArgs.filePath === 'string' && rawArgs.filePath.trim()) {
		return rawArgs.filePath.trim();
	}
	if (typeof rawArgs.path === 'string' && rawArgs.path.trim()) {
		return rawArgs.path.trim();
	}
	if (typeof rawArgs.pattern === 'string' && rawArgs.pattern.trim()) {
		return trimDisplay(rawArgs.pattern.trim(), 40);
	}

	const first = Object.values(rawArgs)[0];
	if (typeof first === 'string' && first.trim()) {
		return trimDisplay(first.trim(), 40);
	}

	return undefined;
}

function isCommandToolName(toolName: string): boolean {
	const normalized = toolName.trim().toLowerCase();
	return normalized === 'bash' || normalized === 'execute_command' || normalized.includes('shell');
}

export function getAgentuityCliCommandRemainder(command?: string): string | null {
	if (!command?.trim()) return null;

	for (const segment of splitShellSegments(command)) {
		const remainder = extractAgentuityCliRemainderFromTokens(tokenizeShellLike(segment));
		if (remainder !== null) {
			return remainder;
		}
	}

	return null;
}

export function formatToolDisplay(
	toolName: string,
	rawArgs?: ToolArgsInput
): ToolDisplayDescriptor {
	const normalizedToolName = normalizeDisplayWhitespace(toolName) || 'tool';
	const command = getCommandArg(rawArgs);

	if (isCommandToolName(normalizedToolName) && command) {
		const remainder = getAgentuityCliCommandRemainder(command);
		if (remainder !== null) {
			const brandedToolName = `${AGENTUITY_CLI_MARK} agentuity`;
			const toolArgs = remainder ? trimDisplay(remainder, 60) : undefined;
			return {
				toolName: brandedToolName,
				toolArgs,
				fullLabel: toolArgs ? `${brandedToolName} ${toolArgs}` : brandedToolName,
				branded: true,
			};
		}
	}

	const toolArgs = getGenericToolArgsPreview(rawArgs);
	return {
		toolName: normalizedToolName,
		toolArgs,
		fullLabel: toolArgs ? `${normalizedToolName} ${toolArgs}` : normalizedToolName,
		branded: false,
	};
}
