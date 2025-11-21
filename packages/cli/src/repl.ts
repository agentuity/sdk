/**
 * Reusable REPL (Read-Eval-Print Loop) component for building interactive CLI tools
 */

import * as tui from './tui';
import { getDefaultConfigDir } from './config';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { colorize } from 'json-colorizer';

/**
 * Result of parsing a REPL command
 */
export interface ParsedCommand {
	/** The command name */
	command: string;
	/** Command arguments (positional) */
	args: string[];
	/** Command options (flags/named parameters) */
	options: Record<string, string | boolean>;
}

/**
 * Table column definition
 */
export type TableColumn = tui.TableColumn;

/**
 * Context provided to command handlers
 */
export interface ReplContext {
	/** The parsed command */
	parsed: ParsedCommand;
	/** Raw input line */
	raw: string;
	/** Write output to the REPL */
	write: (message: string) => void;
	/** Write error output to the REPL */
	error: (message: string) => void;
	/** Write success output to the REPL */
	success: (message: string) => void;
	/** Write info output to the REPL */
	info: (message: string) => void;
	/** Write warning output to the REPL */
	warning: (message: string) => void;
	/** Write debug output to the REPL */
	debug: (message: string) => void;
	/** Update the progress/activity message */
	setProgress: (message: string) => void;
	/** Abort signal for cancelling long-running operations */
	signal: AbortSignal;
	/** Exit the REPL */
	exit: () => void;
	/** Render a table with columns and data */
	table: (columns: TableColumn[], data: Record<string, unknown>[]) => void;
	/** Render colorized JSON output */
	json: (value: unknown) => void;
}

/**
 * Command handler function - can return void, Promise<void>, or an async generator for streaming
 */
export type CommandHandler = (
	ctx: ReplContext
) => void | Promise<void> | AsyncGenerator<string, void, unknown>;

/**
 * Command schema for validation and autocomplete
 */
export interface ReplCommandSchema {
	/** Zod schema for arguments (positional) */
	args?: z.ZodTuple<[z.ZodTypeAny, ...z.ZodTypeAny[]]> | z.ZodArray<z.ZodTypeAny>;
	/** Zod schema for options (flags) */
	options?: z.ZodObject<z.ZodRawShape>;
	/** Argument names for display (e.g., ['message', 'count']) */
	argNames?: string[];
}

/**
 * Subcommand definition
 */
export interface ReplSubcommand {
	/** Subcommand name */
	name: string;
	/** Subcommand description */
	description?: string;
	/** Subcommand handler */
	handler: CommandHandler;
	/** Aliases for this subcommand */
	aliases?: string[];
	/** Schema for validation and autocomplete hints */
	schema?: ReplCommandSchema;
}

/**
 * Command definition for the REPL
 */
export interface ReplCommand {
	/** Command name */
	name: string;
	/** Command description (shown in help) */
	description?: string;
	/** Command handler (not used if subcommands provided) */
	handler?: CommandHandler;
	/** Aliases for this command */
	aliases?: string[];
	/** Schema for validation and autocomplete hints */
	schema?: ReplCommandSchema;
	/** Subcommands for this command group */
	subcommands?: ReplSubcommand[];
}

/**
 * REPL configuration
 */
export interface ReplConfig {
	/** REPL prompt (default: "> ") */
	prompt?: string;
	/** Welcome message shown on startup */
	welcome?: string;
	/** Exit message shown on exit */
	exitMessage?: string;
	/** Commands to register */
	commands: ReplCommand[];
	/** Show help command automatically (default: true) */
	showHelp?: boolean;
	/** Name for history file (saved as ~/.config/agentuity/history/<name>.txt) */
	name?: string;
}

/**
 * Parse a command line into command, args, and options
 */
function parseCommandLine(line: string): ParsedCommand {
	const tokens: string[] = [];
	let current = '';
	let inQuotes = false;
	let quoteChar = '';
	let braceDepth = 0;
	let bracketDepth = 0;

	// Tokenize the input, respecting quotes and JSON objects/arrays
	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if ((char === '"' || char === "'") && !inQuotes) {
			inQuotes = true;
			quoteChar = char;
			current += char;
		} else if (char === quoteChar && inQuotes) {
			inQuotes = false;
			quoteChar = '';
			current += char;
		} else if (char === '{' && !inQuotes) {
			braceDepth++;
			current += char;
		} else if (char === '}' && !inQuotes) {
			braceDepth--;
			current += char;
		} else if (char === '[' && !inQuotes) {
			bracketDepth++;
			current += char;
		} else if (char === ']' && !inQuotes) {
			bracketDepth--;
			current += char;
		} else if (char === ' ' && !inQuotes && braceDepth === 0 && bracketDepth === 0) {
			if (current) {
				tokens.push(current);
				current = '';
			}
		} else {
			current += char;
		}
	}
	if (current) {
		tokens.push(current);
	}

	const command = tokens[0] || '';
	const args: string[] = [];
	const options: Record<string, string | boolean> = {};

	// Parse remaining tokens into args and options
	for (let i = 1; i < tokens.length; i++) {
		const token = tokens[i];

		if (token.startsWith('--')) {
			// Long option: --name=value or --flag
			const name = token.slice(2);
			const eqIndex = name.indexOf('=');

			if (eqIndex > 0) {
				options[name.slice(0, eqIndex)] = name.slice(eqIndex + 1);
			} else {
				// Check if next token is a value
				if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
					options[name] = tokens[i + 1];
					i++;
				} else {
					options[name] = true;
				}
			}
		} else if (token.startsWith('-') && token.length > 1) {
			// Short option: -f or -n value
			const name = token.slice(1);

			// Check if next token is a value
			if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
				options[name] = tokens[i + 1];
				i++;
			} else {
				options[name] = true;
			}
		} else {
			args.push(token);
		}
	}

	return { command, args, options };
}

/**
 * Load history from file
 */
async function loadHistory(name: string): Promise<string[]> {
	if (!name) return [];

	try {
		const historyDir = join(getDefaultConfigDir(), 'history');
		const historyFile = join(historyDir, `${name}.txt`);

		if (!(await Bun.file(historyFile).exists())) {
			return [];
		}

		const content = await Bun.file(historyFile).text();
		return content.split('\n').filter((line) => line.trim());
	} catch (_err) {
		return [];
	}
}

/**
 * Save history to file
 */
async function saveHistory(name: string, history: string[]): Promise<void> {
	if (!name) return;

	try {
		const historyDir = join(getDefaultConfigDir(), 'history');
		await mkdir(historyDir, { recursive: true });

		const historyFile = join(historyDir, `${name}.txt`);
		await Bun.write(historyFile, history.join('\n'));
	} catch (_err) {
		// Silently fail - history is not critical
	}
}

/**
 * Create and run a REPL
 */
export async function createRepl(config: ReplConfig): Promise<void> {
	const prompt = config.prompt || '> ';
	const showHelp = config.showHelp !== false;
	const historyName = config.name || '';

	// Load command history
	const history = await loadHistory(historyName);
	let historyIndex = history.length;

	// Build command map with aliases
	const commandMap = new Map<string, ReplCommand>();
	for (const cmd of config.commands) {
		commandMap.set(cmd.name.toLowerCase(), cmd);
		if (cmd.aliases) {
			for (const alias of cmd.aliases) {
				commandMap.set(alias.toLowerCase(), cmd);
			}
		}
	}

	// Add built-in help command
	if (showHelp) {
		const helpCommand: ReplCommand = {
			name: 'help',
			description: 'Show available commands',
			aliases: ['?'],
			handler: (ctx) => {
				ctx.info('Available commands:');
				tui.newline();

				for (const cmd of config.commands) {
					const aliases = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
					const desc = cmd.description || 'No description';
					console.log(`  ${tui.bold(cmd.name)}${tui.muted(aliases)}`);
					console.log(`    ${desc}`);
				}

				tui.newline();
				console.log(`  ${tui.bold('exit')} ${tui.muted('(quit, q)')}`);
				console.log(`    Exit the REPL`);
			},
		};
		commandMap.set('help', helpCommand);
		commandMap.set('?', helpCommand);
	}

	// Show welcome message
	if (config.welcome) {
		console.log(tui.bold(config.welcome));
		tui.newline();
	}

	// REPL state
	let running = true;
	const ctrlCState = { lastTime: 0 };
	let commandAbortController: AbortController | null = null;

	const exitRepl = () => {
		running = false;
	};

	// Build list of all command names for autocomplete
	const commandNames = Array.from(commandMap.keys());

	// Remove any existing SIGINT handlers to prevent default exit
	process.removeAllListeners('SIGINT');

	// Setup global SIGINT handler to prevent default exit
	const globalSigintHandler = () => {
		// If command is running, abort it
		if (commandAbortController && !commandAbortController.signal.aborted) {
			commandAbortController.abort();
			// Don't exit - just abort the command
			return;
		}
		// If not running command, ignore - let raw mode handler deal with it
	};
	process.on('SIGINT', globalSigintHandler);

	// Main REPL loop
	while (running) {
		// Reset Ctrl+C timer when starting new command
		ctrlCState.lastTime = 0;

		// Read input with history support
		process.stdout.write(prompt);

		const input = await readLine(
			history,
			historyIndex,
			prompt,
			commandNames,
			commandMap,
			ctrlCState
		);
		if (input === null) {
			// EOF (Ctrl+D)
			break;
		}

		const { line: rawInput, newHistoryIndex } = input;
		historyIndex = newHistoryIndex;

		const line = rawInput.trim();
		if (!line) {
			continue;
		}

		// Parse command
		const parsed = parseCommandLine(line);

		// Check for exit commands
		if (['exit', 'quit', 'q'].includes(parsed.command.toLowerCase())) {
			break;
		}

		// Find and execute command
		const cmd = commandMap.get(parsed.command.toLowerCase());
		if (!cmd) {
			tui.error(`Unknown command: ${parsed.command}`);
			console.log(`Type ${tui.bold('help')} for available commands`);
			continue;
		}

		// Check if command has subcommands
		let actualHandler = cmd.handler;
		let actualSchema = cmd.schema;

		if (cmd.subcommands && cmd.subcommands.length > 0) {
			// Parse subcommand from first arg
			const subcommandName = parsed.args[0]?.toLowerCase();

			if (!subcommandName) {
				tui.error(`Missing subcommand for ${parsed.command}`);
				console.log('Available subcommands:');
				for (const sub of cmd.subcommands) {
					const argHint = sub.schema?.argNames?.map((n) => `<${n}>`).join(' ') || '';
					console.log(
						`  ${tui.bold(sub.name)} ${argHint} ${tui.muted(sub.description || '')}`
					);
				}
				continue;
			}

			const subcommand = cmd.subcommands.find(
				(sub) =>
					sub.name.toLowerCase() === subcommandName || sub.aliases?.includes(subcommandName)
			);

			if (!subcommand) {
				tui.error(`Unknown subcommand: ${parsed.command} ${subcommandName}`);
				console.log('Available subcommands:');
				for (const sub of cmd.subcommands) {
					const argHint = sub.schema?.argNames?.map((n) => `<${n}>`).join(' ') || '';
					console.log(
						`  ${tui.bold(sub.name)} ${argHint} ${tui.muted(sub.description || '')}`
					);
				}
				continue;
			}

			// Use subcommand handler and schema, remove subcommand from args
			actualHandler = subcommand.handler;
			actualSchema = subcommand.schema;
			parsed.args = parsed.args.slice(1);
		}

		if (!actualHandler) {
			tui.error(`Command ${parsed.command} requires a subcommand`);
			continue;
		}

		// Validate against schema if provided
		if (actualSchema) {
			try {
				if (actualSchema.args) {
					parsed.args = actualSchema.args.parse(parsed.args) as string[];
				}

				if (actualSchema.options) {
					parsed.options = actualSchema.options.parse(parsed.options) as Record<
						string,
						string | boolean
					>;
				}
			} catch (err) {
				if (err instanceof z.ZodError) {
					tui.error('Invalid arguments:');
					for (const issue of err.issues) {
						const path = issue.path.join('.');
						console.log(
							`  ${tui.colorError('•')} ${path ? `${path}: ` : ''}${issue.message}`
						);
					}
					continue;
				}
				throw err;
			}
		}

		// Create context with output buffering for paging
		const outputBuffer: string[] = [];

		const bufferWrite = (msg: string) => {
			outputBuffer.push(...msg.split('\n'));
		};

		// Helper to format messages with icons and colors (without printing)
		const formatMessage = (
			type: 'success' | 'error' | 'info' | 'warning' | 'debug',
			msg: string
		): string => {
			const icons = {
				success: '✓',
				error: '✗',
				warning: '⚠',
				info: 'ℹ',
				debug: '',
			};

			const colorFormatters = {
				success: tui.colorSuccess,
				error: tui.colorError,
				warning: tui.colorWarning,
				info: tui.colorInfo,
				debug: tui.colorMuted,
			};

			const icon = icons[type];
			const formatter = colorFormatters[type];

			if (!icon) {
				return formatter(msg); // debug messages have no icon
			}

			return `${formatter(icon + ' ' + msg)}`;
		};

		// Create abort controller for this command
		const abortController = new AbortController();
		commandAbortController = abortController;

		const ctx: ReplContext = {
			parsed,
			raw: line,
			write: bufferWrite,
			error: (msg: string) => outputBuffer.push(formatMessage('error', msg)),
			success: (msg: string) => outputBuffer.push(formatMessage('success', msg)),
			info: (msg: string) => outputBuffer.push(formatMessage('info', msg)),
			warning: (msg: string) => outputBuffer.push(formatMessage('warning', msg)),
			debug: (msg: string) => outputBuffer.push(formatMessage('debug', msg)),
			setProgress: (msg: string) => spinner.updateMessage(msg),
			signal: abortController.signal,
			exit: exitRepl,
			table: (columns: TableColumn[], data: Record<string, unknown>[]) => {
				// Capture table output to buffer instead of direct stdout
				const tableOutput = tui.table(data, columns, { render: true }) || '';
				outputBuffer.push(...tableOutput.split('\n'));
			},
			json: (value: unknown) => {
				// Use util.inspect for colorized output if colors are enabled
				const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
				const output = colorize(stringValue);
				outputBuffer.push(output);
			},
		};

		// Execute command handler with activity indicator
		const spinner = new ActivityIndicator(parsed.command);
		spinner.start();

		try {
			const result = actualHandler(ctx);

			// Handle async generator (streaming)
			if (result && typeof result === 'object' && Symbol.asyncIterator in result) {
				for await (const chunk of result as AsyncGenerator<string, void, unknown>) {
					if (abortController.signal.aborted) {
						break;
					}
					outputBuffer.push(...chunk.split('\n'));
				}
			} else if (result && typeof result === 'object' && 'then' in result) {
				// Handle promise
				await result;
			}

			spinner.stop();
			commandAbortController = null;

			// Check if aborted
			if (abortController.signal.aborted) {
				tui.warning('Command aborted');
				continue;
			}

			// Display output with paging
			if (outputBuffer.length > 0) {
				await displayWithPaging(outputBuffer);
			}

			// Add successful command to history
			if (history[history.length - 1] !== line) {
				history.push(line);
				historyIndex = history.length;

				// Save history asynchronously (don't await to avoid blocking)
				saveHistory(historyName, history);
			}
		} catch (err) {
			spinner.stop();
			commandAbortController = null;

			// Check if it was an abort
			if (err instanceof Error && err.name === 'AbortError') {
				tui.warning('Command aborted');
			} else {
				tui.error(`Command failed: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	// Cleanup global handler
	process.off('SIGINT', globalSigintHandler);

	// Show exit message
	if (config.exitMessage) {
		tui.info(config.exitMessage);
	}
}

/**
 * Get all autocomplete matches based on current input
 */
function getAutocompleteMatches(
	buffer: string,
	commands: string[],
	commandMap?: Map<string, ReplCommand>
): string[] {
	if (!buffer.trim()) return [];

	const tokens = buffer.trim().split(/\s+/);
	const firstToken = tokens[0].toLowerCase();

	// If we're typing the first word (no trailing space), suggest commands
	if (tokens.length === 1 && buffer === buffer.trimEnd()) {
		return commands.filter((cmd) => cmd.startsWith(firstToken) && cmd !== firstToken);
	}

	// If we have a command + space, suggest subcommands
	if (tokens.length === 1 && buffer !== buffer.trimEnd() && commandMap) {
		const cmd = commandMap.get(firstToken);
		if (cmd?.subcommands) {
			return cmd.subcommands.map((sub) => sub.name);
		}
		return [];
	}

	// If we're typing a subcommand, filter matches
	if (tokens.length === 2 && buffer === buffer.trimEnd() && commandMap) {
		const cmd = commandMap.get(firstToken);
		if (cmd?.subcommands) {
			const subToken = tokens[1].toLowerCase();
			return cmd.subcommands
				.filter((sub) => sub.name.startsWith(subToken) && sub.name !== subToken)
				.map((sub) => sub.name);
		}
		return [];
	}

	return [];
}

/**
 * Get autocomplete suggestion based on current input and cycle index
 */
function getAutocompleteSuggestion(
	buffer: string,
	commands: string[],
	commandMap: Map<string, ReplCommand>,
	cycleIndex: number = 0
): string {
	const matches = getAutocompleteMatches(buffer, commands, commandMap);
	if (matches.length === 0) return '';

	const selectedMatch = matches[cycleIndex % matches.length];
	const tokens = buffer.trim().split(/\s+/);
	const firstToken = tokens[0].toLowerCase();

	// Typing first word (command name)
	if (tokens.length === 1 && buffer === buffer.trimEnd()) {
		const cmd = commandMap.get(selectedMatch.toLowerCase());
		let suggestion = selectedMatch.slice(firstToken.length);

		// Add argument placeholders if schema exists
		if (cmd?.schema?.argNames) {
			suggestion += ' ' + cmd.schema.argNames.map((name) => `<${name}>`).join(' ');
		}
		// Add subcommand hint if this command has subcommands
		else if (cmd?.subcommands && cmd.subcommands.length > 0) {
			suggestion += ' <subcommand>';
		}

		return suggestion;
	}

	// After command + space, suggesting subcommands
	if (tokens.length === 1 && buffer !== buffer.trimEnd()) {
		return selectedMatch;
	}

	// Typing subcommand name
	if (tokens.length === 2 && buffer === buffer.trimEnd()) {
		const cmd = commandMap.get(firstToken);
		const subToken = tokens[1];
		const subcommand = cmd?.subcommands?.find((sub) => sub.name === selectedMatch);

		let suggestion = selectedMatch.slice(subToken.length);

		// Add argument placeholders for subcommand
		if (subcommand?.schema?.argNames) {
			suggestion += ' ' + subcommand.schema.argNames.map((name) => `<${name}>`).join(' ');
		}

		return suggestion;
	}

	return '';
}

/**
 * Display output with paging if it's too long
 */
async function displayWithPaging(lines: string[]): Promise<void> {
	const terminalHeight = process.stdout.rows || 24;
	const pageSize = terminalHeight - 2; // Leave room for prompt

	if (lines.length <= pageSize) {
		// Short output, just display it
		for (const line of lines) {
			console.log(`\x1b[2m│\x1b[0m ${line}`);
		}
		return;
	}

	// Long output, page it
	let currentLine = 0;

	while (currentLine < lines.length) {
		// Clear screen and show current page
		const endLine = Math.min(currentLine + pageSize, lines.length);

		for (let i = currentLine; i < endLine; i++) {
			console.log(`${tui.colorMuted('│')} ${lines[i]}`);
		}

		// Check if there's more
		if (endLine < lines.length) {
			const remaining = lines.length - endLine;
			process.stdout.write(tui.bold(`-- More (${remaining} lines) -- [Space=next, q=quit]`));

			// Wait for keypress
			const key = await waitForKey();
			process.stdout.write('\r\x1b[K'); // Clear the "More" line

			if (key === 'q' || key === '\x03') {
				// Quit
				console.log(`${tui.colorMuted('│')} (output truncated)`);
				break;
			} else if (key === ' ' || key === '\r' || key === '\n') {
				// Continue to next page
				currentLine = endLine;
			} else {
				// Any other key, continue
				currentLine = endLine;
			}
		} else {
			break;
		}
	}
}

/**
 * Wait for a single keypress
 */
async function waitForKey(): Promise<string> {
	return new Promise((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();

		const onData = (chunk: Buffer) => {
			const key = chunk.toString();
			process.stdin.setRawMode(false);
			process.stdin.removeListener('data', onData);
			process.stdin.pause();
			resolve(key);
		};

		process.stdin.on('data', onData);
	});
}

/**
 * Activity indicator that shows a spinner while command is executing
 */
class ActivityIndicator {
	private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
	private currentFrame = 0;
	private intervalId: Timer | null = null;
	private message: string;

	constructor(message: string = 'Running') {
		this.message = message;
	}

	start() {
		// Hide cursor
		process.stdout.write('\x1b[?25l');

		// Show initial spinner on current line
		this.draw();

		// Update spinner every 80ms
		this.intervalId = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
			this.draw();
		}, 80);
	}

	private draw() {
		const frame = this.frames[this.currentFrame];
		// Clear line, draw spinner, stay on same line
		process.stdout.write('\r\x1b[K'); // Clear line from cursor
		process.stdout.write(`${tui.muted(frame)} ${tui.muted(this.message)}...`);
	}

	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}

		// Clear the spinner line - cursor stays at start of line
		process.stdout.write('\r\x1b[K'); // Clear current line, cursor at start

		// Show cursor again
		process.stdout.write('\x1b[?25h');
	}

	updateMessage(message: string) {
		this.message = message;
	}
}

/**
 * Show command picker popup and return selected command
 */
async function showCommandPicker(
	commandMap: Map<string, ReplCommand>,
	prompt: string
): Promise<string | null> {
	// Build list of commands
	const commands = Array.from(commandMap.entries())
		.filter(([name, cmd]) => name === cmd.name.toLowerCase())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, cmd]) => ({
			name,
			description: cmd.description || 'No description',
			argHint: cmd.schema?.argNames?.map((n) => `<${n}>`).join(' ') || '',
		}));

	let selectedIndex = 0;
	const menuHeight = commands.length + 2; // +2 for header and blank line

	// Calculate max command text length for padding
	const maxCmdLength = Math.max(
		...commands.map((cmd) => {
			const cmdText = `${cmd.name}${cmd.argHint ? ' ' + cmd.argHint : ''}`;
			return cmdText.length;
		})
	);

	const drawPicker = () => {
		// Save cursor position, move down to draw menu
		process.stdout.write('\n'); // Move to next line

		// Draw header
		console.log(
			tui.bold('Command Picker') + ' ' + tui.muted('(↑/↓ navigate, Enter select, Esc cancel)')
		);

		// Draw commands
		for (let i = 0; i < commands.length; i++) {
			const cmd = commands[i];
			const isSelected = i === selectedIndex;
			const prefix = isSelected ? '▶ ' : '  ';
			const style = isSelected ? '\x1b[7m' : ''; // Reverse video for selected
			const reset = isSelected ? '\x1b[0m' : '';

			const cmdText = `${cmd.name}${cmd.argHint ? ' ' + cmd.argHint : ''}`;
			const paddedCmdText = cmdText.padEnd(maxCmdLength);
			const description = tui.muted(cmd.description);

			console.log(`${prefix}${style}${tui.bold(paddedCmdText)}${reset}  ${description}`);
		}

		// Move cursor back to prompt line
		process.stdout.write(`\x1b[${menuHeight}A`); // Move up N lines
		process.stdout.write(`\r${prompt}/`); // Redraw prompt with /
	};

	const clearPicker = () => {
		// Move down to menu area
		process.stdout.write(`\x1b[${menuHeight}B`); // Move down to after menu
		// Clear all menu lines by moving up and clearing
		for (let i = 0; i < menuHeight; i++) {
			process.stdout.write('\x1b[A'); // Move up
			process.stdout.write('\r\x1b[K'); // Clear line
		}
		// Back to prompt - clear the line completely
		process.stdout.write('\r\x1b[K');
	};

	drawPicker();

	return new Promise((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();

		const onData = (chunk: Buffer) => {
			const bytes = Array.from(chunk);

			// Escape or Ctrl+C - cancel
			if (bytes[0] === 0x1b && bytes.length === 1) {
				cleanup();
				clearPicker();
				resolve(null);
				return;
			}

			if (bytes[0] === 0x03) {
				cleanup();
				clearPicker();
				resolve(null);
				return;
			}

			// Enter - select
			if (bytes[0] === 0x0d || bytes[0] === 0x0a) {
				const selected = commands[selectedIndex];
				cleanup();
				clearPicker();
				resolve(selected.name + (selected.argHint ? ' ' : ''));
				return;
			}

			// Arrow keys
			if (bytes[0] === 0x1b && bytes[1] === 0x5b) {
				// Up arrow
				if (bytes[2] === 0x41) {
					selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : commands.length - 1;
					drawPicker();
					return;
				}

				// Down arrow
				if (bytes[2] === 0x42) {
					selectedIndex = (selectedIndex + 1) % commands.length;
					drawPicker();
					return;
				}
			}
		};

		const cleanup = () => {
			process.stdin.setRawMode(false);
			process.stdin.removeListener('data', onData);
			process.stdin.pause();
		};

		process.stdin.on('data', onData);
	});
}

/**
 * Apply syntax highlighting to buffer
 */
function applySyntaxHighlighting(buffer: string, commands: string[]): string {
	if (!buffer.trim()) return buffer;

	const tokens = buffer.split(/(\s+)/); // Split but keep whitespace
	let result = '';
	let isFirstToken = true;

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];

		// Skip whitespace
		if (/^\s+$/.test(token)) {
			result += token;
			continue;
		}

		// First token is the command
		if (isFirstToken) {
			const isValid = commands.includes(token.toLowerCase());
			if (isValid) {
				result += tui.colorSuccess(token); // Green for valid command
			} else {
				result += tui.colorError(token); // Red for invalid command
			}
			isFirstToken = false;
		}
		// Options (start with - or --)
		else if (token.startsWith('-')) {
			result += tui.colorInfo(token); // Cyan for options
		}
		// Regular arguments
		else {
			result += tui.colorMuted(token); // Gray for arguments
		}
	}

	return result;
}

/**
 * Read a line from stdin with arrow key history support and autocomplete
 */
async function readLine(
	history: string[],
	startIndex: number,
	prompt: string = '',
	commands: string[] = [],
	commandMap?: Map<string, ReplCommand>,
	ctrlCState?: { lastTime: number }
): Promise<{ line: string; newHistoryIndex: number } | null> {
	return new Promise((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();

		// Enable vertical bar cursor
		process.stdout.write('\x1b[6 q');

		let buffer = '';
		let cursorPos = 0;
		let historyIndex = startIndex;
		let searchMode = false;
		let searchQuery = '';
		let searchResultIndex = -1;
		let autocompleteCycleIndex = 0;
		let lastAutocompleteBuffer = '';
		const lines: string[] = [''];
		let currentLineIndex = 0;

		const searchHistory = (query: string, startFrom: number): number => {
			for (let i = startFrom - 1; i >= 0; i--) {
				if (history[i].toLowerCase().includes(query.toLowerCase())) {
					return i;
				}
			}
			return -1;
		};

		const redraw = (cmdMap?: Map<string, ReplCommand>) => {
			if (searchMode) {
				// Search mode display
				process.stdout.write('\r\x1b[K');
				const foundEntry = searchResultIndex >= 0 ? history[searchResultIndex] : '';
				const searchPrompt = `(reverse-i-search)\`${searchQuery}': `;
				process.stdout.write(searchPrompt + foundEntry);
			} else if (lines.length > 1) {
				// Multi-line mode - redraw all lines
				// Move to start of first line
				for (let i = 0; i < currentLineIndex; i++) {
					process.stdout.write('\x1b[A'); // Move up
				}
				process.stdout.write('\r');

				// Redraw all lines
				for (let i = 0; i < lines.length; i++) {
					process.stdout.write('\x1b[K'); // Clear line
					const linePrompt = i === 0 ? prompt : '... ';
					process.stdout.write(linePrompt + lines[i]);
					if (i < lines.length - 1) {
						process.stdout.write('\n');
					}
				}

				// Position cursor on current line at cursor position
				const linesToMove = lines.length - 1 - currentLineIndex;
				for (let i = 0; i < linesToMove; i++) {
					process.stdout.write('\x1b[A'); // Move up to current line
				}
				const linePrompt = currentLineIndex === 0 ? prompt : '... ';
				process.stdout.write('\r');
				process.stdout.write(linePrompt + lines[currentLineIndex].slice(0, cursorPos));
			} else {
				// Single-line mode (original behavior)
				process.stdout.write('\r\x1b[K');
				const suggestion = cmdMap
					? getAutocompleteSuggestion(buffer, commands, cmdMap, autocompleteCycleIndex)
					: '';
				const matches = cmdMap ? getAutocompleteMatches(buffer, commands, cmdMap) : [];

				// Apply syntax highlighting to buffer
				const highlightedBuffer = applySyntaxHighlighting(buffer, commands);
				process.stdout.write(prompt + highlightedBuffer);

				// Show suggestion in dark gray (only when cursor is at end)
				const showSuggestion = suggestion && cursorPos === buffer.length;
				if (showSuggestion) {
					process.stdout.write(`\x1b[90m${suggestion}\x1b[0m`);

					// Show match count if multiple matches
					if (matches.length > 1) {
						process.stdout.write(
							` \x1b[90m[${autocompleteCycleIndex + 1}/${matches.length}]\x1b[0m`
						);
					}
				}

				// Move cursor to correct position (accounting for prompt length and suggestion)
				const suggestionLength = showSuggestion ? suggestion.length : 0;
				const counterLength =
					showSuggestion && matches.length > 1
						? ` [${autocompleteCycleIndex + 1}/${matches.length}]`.length
						: 0;
				const totalLength = buffer.length + suggestionLength + counterLength;
				const diff = totalLength - cursorPos;
				if (diff > 0) {
					process.stdout.write(`\x1b[${diff}D`);
				}
			}
		};

		const onData = async (chunk: Buffer) => {
			const bytes = Array.from(chunk);

			// Check for / key - show command picker
			if (bytes[0] === 0x2f && buffer.length === 0 && commandMap) {
				// '/' key at start of line

				// Temporarily remove our listener to avoid conflicts
				process.stdin.removeListener('data', onData);

				const selected = await showCommandPicker(commandMap, prompt);

				// Re-attach our listener and restore state
				process.stdin.setRawMode(true);
				process.stdin.resume();
				process.stdin.on('data', onData);

				if (selected) {
					buffer = selected;
					cursorPos = buffer.length;
					lines[currentLineIndex] = buffer;
					// Reset autocomplete state
					autocompleteCycleIndex = 0;
					lastAutocompleteBuffer = '';
					// Force full redraw after command picker
					redraw(commandMap);
				}
				return;
			}

			// Check for Ctrl+C - double press to exit
			if (bytes[0] === 0x03 && ctrlCState) {
				const now = Date.now();
				const timeSinceLastCtrlC = now - ctrlCState.lastTime;

				// If pressed within 2 seconds, exit
				if (timeSinceLastCtrlC < 2000 && ctrlCState.lastTime > 0) {
					cleanup();
					console.log(''); // Newline before exit
					process.exit(0);
				}

				// First Ctrl+C - show message below, keep prompt in place
				ctrlCState.lastTime = now;

				// Save cursor position
				const promptWithBuffer = prompt + buffer;

				// Move to new line and show message
				process.stdout.write('\n');
				process.stdout.write(tui.muted('Press Ctrl+C again to exit'));

				// Move back up to prompt line
				process.stdout.write('\x1b[A'); // Move up one line
				process.stdout.write(`\r`); // Go to start of line
				process.stdout.write(promptWithBuffer); // Redraw prompt

				// Position cursor at correct location
				if (cursorPos < buffer.length) {
					const diff = buffer.length - cursorPos;
					process.stdout.write(`\x1b[${diff}D`);
				}

				return;
			}

			// Check for Ctrl+D (EOF)
			if (bytes[0] === 0x04 && buffer.length === 0) {
				cleanup();
				resolve(null);
				return;
			}

			// Check for Ctrl+A (jump to start)
			if (bytes[0] === 0x01) {
				cursorPos = 0;
				redraw(commandMap);
				return;
			}

			// Check for Ctrl+E (jump to end)
			if (bytes[0] === 0x05) {
				cursorPos = buffer.length;
				redraw(commandMap);
				return;
			}

			// Check for Ctrl+K (delete to end of line)
			if (bytes[0] === 0x0b) {
				buffer = buffer.slice(0, cursorPos);
				redraw(commandMap);
				return;
			}

			// Check for Ctrl+U (delete entire line)
			if (bytes[0] === 0x15) {
				buffer = '';
				cursorPos = 0;
				redraw(commandMap);
				return;
			}

			// Check for Ctrl+W (delete word backward)
			if (bytes[0] === 0x17) {
				const beforeCursor = buffer.slice(0, cursorPos);
				const match = beforeCursor.match(/\s*\S+\s*$/);
				if (match) {
					const deleteCount = match[0].length;
					buffer = buffer.slice(0, cursorPos - deleteCount) + buffer.slice(cursorPos);
					cursorPos -= deleteCount;
					redraw(commandMap);
				}
				return;
			}

			// Check for Ctrl+L (clear screen)
			if (bytes[0] === 0x0c) {
				process.stdout.write('\x1b[2J\x1b[H');
				redraw(commandMap);
				return;
			}

			// Check for Ctrl+R (reverse search)
			if (bytes[0] === 0x12) {
				if (!searchMode) {
					// Enter search mode
					searchMode = true;
					searchQuery = '';
					searchResultIndex = searchHistory('', history.length);
					redraw(commandMap);
				} else {
					// Find next match
					if (searchResultIndex > 0) {
						searchResultIndex = searchHistory(searchQuery, searchResultIndex);
						redraw(commandMap);
					}
				}
				return;
			}

			// Check for Tab (autocomplete - cycle only)
			if (bytes[0] === 0x09 && commandMap) {
				const matches = getAutocompleteMatches(buffer, commands, commandMap);

				if (matches.length === 0) {
					// No matches, do nothing
					return;
				}

				// Check if we're cycling through the same buffer
				if (buffer === lastAutocompleteBuffer && matches.length > 0) {
					// Continue cycling
					autocompleteCycleIndex = (autocompleteCycleIndex + 1) % matches.length;
					redraw(commandMap);
				} else {
					// Start new cycle - show first suggestion
					autocompleteCycleIndex = 0;
					lastAutocompleteBuffer = buffer;
					redraw(commandMap);
				}
				return;
			}

			// Check for Shift+Enter (newline without submit)
			// Different terminals send different sequences:
			// - iTerm2/Terminal.app: ESC + Enter (0x1b, 0x0d or 0x1b, 0x0a)
			// - Some terminals: ESC[27;2;13~
			// - VSCode: ESC[13;2u
			if (
				(bytes[0] === 0x1b && bytes.length === 2 && (bytes[1] === 0x0d || bytes[1] === 0x0a)) || // ESC + Enter
				(bytes[0] === 0x1b &&
					bytes[1] === 0x5b &&
					bytes.includes(0x3b) &&
					bytes.includes(0x32)) || // ESC[...;2;...
				(bytes[0] === 0x1b &&
					bytes[1] === 0x5b &&
					bytes[2] === 0x31 &&
					bytes[3] === 0x33 &&
					bytes[4] === 0x3b &&
					bytes[5] === 0x32) // ESC[13;2u
			) {
				// Shift+Enter detected - add newline
				lines.push('');
				currentLineIndex++;
				cursorPos = 0;
				buffer = lines[currentLineIndex];
				process.stdout.write('\n');
				process.stdout.write('... ');
				return;
			}

			// Check for Enter
			if (bytes[0] === 0x0d || bytes[0] === 0x0a) {
				if (searchMode) {
					// Accept search result
					if (searchResultIndex >= 0) {
						buffer = history[searchResultIndex];
					}
					searchMode = false;
					process.stdout.write('\n');
					cleanup();
					resolve({ line: buffer, newHistoryIndex: history.length });
					return;
				}

				// Check if line ends with backslash (continuation)
				if (buffer.endsWith('\\')) {
					// Remove backslash and continue to next line
					lines[currentLineIndex] = buffer.slice(0, -1);
					lines.push('');
					currentLineIndex++;
					cursorPos = 0;
					buffer = '';
					process.stdout.write('\n');
					process.stdout.write('... ');
					return;
				}

				// Check for unclosed quotes or brackets
				const hasUnclosedQuote =
					(buffer.match(/"/g) || []).length % 2 !== 0 ||
					(buffer.match(/'/g) || []).length % 2 !== 0;
				const openBrackets = (buffer.match(/[{[(]/g) || []).length;
				const closeBrackets = (buffer.match(/[}\])]/g) || []).length;

				if (hasUnclosedQuote || openBrackets > closeBrackets) {
					// Auto-continue to next line
					lines[currentLineIndex] = buffer;
					lines.push('');
					currentLineIndex++;
					cursorPos = 0;
					buffer = '';
					process.stdout.write('\n');
					process.stdout.write('... ');
					return;
				}

				// Submit the command
				process.stdout.write('\n');
				const finalBuffer = lines.length > 1 ? lines.join('\n') : buffer;
				cleanup();
				resolve({ line: finalBuffer, newHistoryIndex: history.length });
				return;
			}

			// Check for Esc key (cancel search mode)
			if (bytes[0] === 0x1b && bytes.length === 1) {
				if (searchMode) {
					searchMode = false;
					searchQuery = '';
					searchResultIndex = -1;
					redraw(commandMap);
				}
				return;
			}

			// Check for escape sequences (arrow keys, delete, home, end)
			if (bytes[0] === 0x1b && bytes[1] === 0x5b) {
				// Up arrow
				if (bytes[2] === 0x41) {
					if (historyIndex > 0) {
						historyIndex--;
						buffer = history[historyIndex] || '';
						cursorPos = buffer.length;
						redraw(commandMap);
					}
					return;
				}

				// Down arrow
				if (bytes[2] === 0x42) {
					if (historyIndex < history.length) {
						historyIndex++;
						buffer = history[historyIndex] || '';
						cursorPos = buffer.length;
						redraw(commandMap);
					}
					return;
				}

				// Right arrow
				if (bytes[2] === 0x43) {
					// Check if we're at the end and have a suggestion to accept
					if (cursorPos === buffer.length && commandMap) {
						const suggestion = getAutocompleteSuggestion(
							buffer,
							commands,
							commandMap,
							autocompleteCycleIndex
						);
						if (suggestion) {
							// Accept the autocomplete suggestion (without argument placeholders)
							// Remove argument placeholders like <key> <value> from suggestion
							let completionOnly = suggestion.replace(/<[^>]+>/g, '').trimEnd();

							// Add trailing space if there were argument placeholders
							if (suggestion.includes('<')) {
								completionOnly += ' ';
							}

							buffer += completionOnly;
							cursorPos = buffer.length;
							lines[currentLineIndex] = buffer;
							autocompleteCycleIndex = 0;
							lastAutocompleteBuffer = '';
							redraw(commandMap);
							return;
						}
					}

					// Normal cursor movement
					if (cursorPos < buffer.length) {
						cursorPos++;
						process.stdout.write('\x1b[C');
					}
					return;
				}

				// Left arrow
				if (bytes[2] === 0x44) {
					if (cursorPos > 0) {
						cursorPos--;
						process.stdout.write('\x1b[D');
					}
					return;
				}

				// Delete key (ESC[3~)
				if (bytes[2] === 0x33 && bytes.length > 3 && bytes[3] === 0x7e) {
					if (cursorPos < buffer.length) {
						buffer = buffer.slice(0, cursorPos) + buffer.slice(cursorPos + 1);
						redraw(commandMap);
					}
					return;
				}

				// Home key (ESC[H or ESC[1~)
				if (bytes[2] === 0x48 || (bytes[2] === 0x31 && bytes[3] === 0x7e)) {
					cursorPos = 0;
					redraw(commandMap);
					return;
				}

				// End key (ESC[F or ESC[4~)
				if (bytes[2] === 0x46 || (bytes[2] === 0x34 && bytes[3] === 0x7e)) {
					cursorPos = buffer.length;
					redraw(commandMap);
					return;
				}
			}

			// Backspace
			if (bytes[0] === 0x7f || bytes[0] === 0x08) {
				if (searchMode) {
					// In search mode, delete from search query
					if (searchQuery.length > 0) {
						searchQuery = searchQuery.slice(0, -1);
						searchResultIndex = searchHistory(searchQuery, history.length);
						redraw(commandMap);
					}
				} else {
					if (cursorPos > 0) {
						buffer = buffer.slice(0, cursorPos - 1) + buffer.slice(cursorPos);
						cursorPos--;
						redraw(commandMap);
					}
				}
				return;
			}

			// Regular character input
			if (searchMode) {
				// In search mode, add to search query
				const char = chunk.toString();
				if (char.match(/^[\x20-\x7E]$/)) {
					// Printable ASCII
					searchQuery += char;
					searchResultIndex = searchHistory(searchQuery, history.length);
					redraw(commandMap);
				}
			} else {
				const char = chunk.toString();
				buffer = buffer.slice(0, cursorPos) + char + buffer.slice(cursorPos);
				cursorPos += char.length;

				// Update current line
				lines[currentLineIndex] = buffer;

				// Reset autocomplete cycle on new input
				autocompleteCycleIndex = 0;
				lastAutocompleteBuffer = '';

				// Always redraw to show autocomplete suggestion
				redraw(commandMap);
			}
		};

		const cleanup = () => {
			// Restore default block cursor
			process.stdout.write('\x1b[0 q');
			process.stdin.setRawMode(false);
			process.stdin.removeListener('data', onData);
			process.stdin.pause();
		};

		process.stdin.on('data', onData);
	});
}
