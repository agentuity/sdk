/**
 * TUI tool renderers for Hub tools.
 *
 * Each renderer provides a compact renderCall (one-line summary of the invocation)
 * and a renderResult (collapsed / expanded views of the result).
 * Renderers are looked up by tool name and spread into the registerTool() call.
 */

import type { Theme, ToolRenderResultOptions, AgentToolResult } from '@mariozechner/pi-coding-agent';
import { Box, Text, Container, type Component } from '@mariozechner/pi-tui';

// ──────────────────────────────────────────────
// Line-safety helper — must be declared before SimpleText so
// render() can reference it without temporal-dead-zone issues.
// ──────────────────────────────────────────────

/** Pre-render safety net — truncate lines before they reach render(). Reduced from 200 to 160. */
const SAFE_LINE_WIDTH = 160;
function safeLine(line: string): string {
	return line.length > SAFE_LINE_WIDTH ? line.slice(0, SAFE_LINE_WIDTH - 3) + '...' : line;
}

/**
 * Truncate a string (possibly containing ANSI escape codes) to fit within
 * a given visible width. Handles escape sequences properly so colours are
 * never broken — a RESET is appended when truncation occurs.
 */
export function truncateToWidth(line: string, maxWidth: number): string {
	if (maxWidth <= 0) return '';
	// Fast path: no ANSI codes and short enough
	if (line.length <= maxWidth && !line.includes('\x1b')) return line;

	// Strip ANSI to measure visible length
	// eslint-disable-next-line no-control-regex
	const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
	if (visible.length <= maxWidth) return line;

	// Need to truncate — walk through respecting ANSI escape sequences
	let vis = 0;
	let i = 0;
	const target = Math.max(0, maxWidth - 3); // room for "..."
	while (i < line.length && vis < target) {
		if (line[i] === '\x1b') {
			// Skip entire ANSI escape sequence
			const end = line.indexOf('m', i);
			if (end !== -1) {
				i = end + 1;
			} else {
				i++;
			}
		} else {
			vis++;
			i++;
		}
	}
	return line.slice(0, i) + '\x1b[0m...';
}

// ──────────────────────────────────────────────
// Lightweight text component used by simpler renderers.
// Complex renderers (task, parallel_tasks) use Box/Text/Container from pi-tui.
// ──────────────────────────────────────────────

export class SimpleText {
	private text: string;

	constructor(text: string) {
		this.text = text;
	}

	render(width: number): string[] {
		return this.text.split('\n').map(line => truncateToWidth(line, width));
	}

	invalidate(): void {
		// no-op — we don't cache
	}
}

// ──────────────────────────────────────────────
// Types matching Pi's ToolDefinition.renderCall / renderResult
// ──────────────────────────────────────────────

type RenderCallFn = (args: Record<string, unknown>, theme: Theme) => Component;
type RenderResultFn = (
	result: AgentToolResult<unknown>,
	options: ToolRenderResultOptions,
	theme: Theme,
) => Component;

export interface ToolRenderers {
	renderCall?: RenderCallFn;
	renderResult?: RenderResultFn;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Extract plain-text from a tool result's content array. */
function resultText(result: AgentToolResult<unknown>): string {
	return result.content
		.filter((c) => 'text' in c && typeof c.text === 'string')
		.map((c) => ('text' in c ? (c as { text: string }).text : ''))
		.join('\n');
}

/** Attempt to parse result text as JSON, returning undefined on failure. */
function tryParseJson(text: string): unknown | undefined {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** Truncate a string to a max length, appending '\u2026' when truncated. */
function truncate(str: string, max: number): string {
	if (str.length <= max) return str;
	return str.slice(0, max - 1) + '\u2026';
}

// ──────────────────────────────────────────────
// Individual tool renderers
// ──────────────────────────────────────────────

function memorySearchRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const query = String(args['query'] ?? '');
			const limit = args['limit'] as number | undefined;
			let text = theme.fg('toolTitle', theme.bold('memory search '));
			text += theme.fg('accent', truncate(query, 60));
			if (limit) text += theme.fg('muted', ` (limit ${limit})`);
			return new SimpleText(text);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Searching\u2026'));
			const raw = resultText(result);
			const parsed = tryParseJson(raw);
			const items = Array.isArray(parsed) ? parsed : [];
			let text = theme.fg('success', `${items.length} result${items.length !== 1 ? 's' : ''}`);
			if (expanded && items.length > 0) {
				const lines = items.slice(0, 10).map((item: Record<string, unknown>) => {
					const key = truncate(String(item['key'] ?? item['id'] ?? '?'), 120);
					const score = typeof item['score'] === 'number' ? ` (${(item['score'] as number).toFixed(2)})` : '';
					return `  ${theme.fg('accent', key)}${theme.fg('muted', score)}`;
				});
				text += '\n' + lines.join('\n');
				if (items.length > 10) text += theme.fg('muted', `\n  \u2026and ${items.length - 10} more`);
			}
			return new SimpleText(text);
		},
	};
}

function memoryStoreRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const key = String(args['key'] ?? '');
			let text = theme.fg('toolTitle', theme.bold('memory store '));
			text += theme.fg('accent', truncate(key, 60));
			return new SimpleText(text);
		},
		renderResult(_result, { isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Storing\u2026'));
			return new SimpleText(theme.fg('success', 'Stored'));
		},
	};
}

function memoryGetRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const key = String(args['key'] ?? '');
			let text = theme.fg('toolTitle', theme.bold('memory get '));
			text += theme.fg('accent', truncate(key, 60));
			return new SimpleText(text);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Loading\u2026'));
			const raw = resultText(result);
			const parsed = tryParseJson(raw);
			if (!parsed) {
				return new SimpleText(theme.fg('muted', raw ? 'Retrieved' : 'Not found'));
			}
			let text = theme.fg('success', 'Retrieved');
			if (expanded) {
				const preview = typeof parsed === 'object'
					? JSON.stringify(parsed, null, 2).split('\n').slice(0, 10).map(safeLine).join('\n')
					: String(parsed);
				text += '\n' + theme.fg('toolOutput', truncate(preview, 500));
			}
			return new SimpleText(text);
		},
	};
}

function memoryUpdateRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const key = String(args['key'] ?? '');
			let text = theme.fg('toolTitle', theme.bold('memory update '));
			text += theme.fg('accent', truncate(key, 60));
			return new SimpleText(text);
		},
		renderResult(_result, { isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Updating\u2026'));
			return new SimpleText(theme.fg('success', 'Updated'));
		},
	};
}

function memoryDeleteRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const key = String(args['key'] ?? '');
			let text = theme.fg('toolTitle', theme.bold('memory delete '));
			text += theme.fg('accent', truncate(key, 60));
			return new SimpleText(text);
		},
		renderResult(_result, { isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Deleting\u2026'));
			return new SimpleText(theme.fg('muted', 'Deleted'));
		},
	};
}

function memoryListRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const namespace = String(args['namespace'] ?? '');
			const prefix = args['prefix'] as string | undefined;
			let text = theme.fg('toolTitle', theme.bold('memory list'));
			if (namespace) text += theme.fg('accent', ` ${truncate(namespace, 30)}`);
			if (prefix) text += theme.fg('accent', ` ${truncate(prefix, 40)}`);
			return new SimpleText(text);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Listing\u2026'));
			const raw = resultText(result);
			const parsed = tryParseJson(raw);
			const keys = Array.isArray(parsed) ? parsed :
				(parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['keys']))
					? (parsed as Record<string, unknown>)['keys'] as unknown[]
					: [];
			let text = theme.fg('success', `${keys.length} key${keys.length !== 1 ? 's' : ''}`);
			if (expanded && keys.length > 0) {
				const lines = keys.slice(0, 15).map((k: unknown) =>
					`  ${theme.fg('accent', truncate(String(k), 120))}`,
				);
				text += '\n' + lines.join('\n');
				if (keys.length > 15) text += theme.fg('muted', `\n  \u2026and ${keys.length - 15} more`);
			}
			return new SimpleText(text);
		},
	};
}

function context7SearchRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const library = String(args['libraryId'] ?? args['library'] ?? '');
			const query = String(args['query'] ?? '');
			let text = theme.fg('toolTitle', theme.bold('context7 '));
			if (library) text += theme.fg('accent', truncate(library, 30) + ' \u2014 ');
			text += theme.fg('text', truncate(query, 50));
			return new SimpleText(text);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Searching docs\u2026'));
			const raw = resultText(result);
			const parsed = tryParseJson(raw);
			const snippets = Array.isArray(parsed) ? parsed :
				(parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['snippets']))
					? (parsed as Record<string, unknown>)['snippets'] as unknown[]
					: [];
			const count = snippets.length || (raw.length > 0 ? '?' : '0');
			let text = theme.fg('success', `${count} snippet${count !== 1 ? 's' : ''}`);
			if (expanded && snippets.length > 0) {
				const lines = snippets.slice(0, 5).map((s: unknown) => {
					const snip = s as Record<string, unknown>;
					const title = String(snip['title'] ?? snip['name'] ?? '');
					return `  ${theme.fg('accent', truncate(title, 80))}`;
				});
				text += '\n' + lines.join('\n');
				if (snippets.length > 5) text += theme.fg('muted', `\n  \u2026and ${snippets.length - 5} more`);
			}
			return new SimpleText(text);
		},
	};
}

function grepAppSearchRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const query = String(args['query'] ?? '');
			const lang = args['language'] as string[] | string | undefined;
			let text = theme.fg('toolTitle', theme.bold('grep.app '));
			text += theme.fg('accent', truncate(query, 50));
			if (lang) {
				const langStr = Array.isArray(lang) ? lang.join(', ') : String(lang);
				text += theme.fg('muted', ` [${langStr}]`);
			}
			return new SimpleText(text);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Searching GitHub\u2026'));
			const raw = resultText(result);
			const parsed = tryParseJson(raw);
			const matches = Array.isArray(parsed) ? parsed :
				(parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)['results']))
					? (parsed as Record<string, unknown>)['results'] as unknown[]
					: [];
			const count = matches.length || (raw.length > 0 ? '?' : '0');
			let text = theme.fg('success', `${count} match${count !== 1 ? 'es' : ''}`);
			if (expanded && matches.length > 0) {
				const lines = matches.slice(0, 8).map((m: unknown) => {
					const match = m as Record<string, unknown>;
					const path = String(match['path'] ?? match['file'] ?? match['repo'] ?? '');
					return `  ${theme.fg('accent', truncate(path, 80))}`;
				});
				text += '\n' + lines.join('\n');
				if (matches.length > 8) text += theme.fg('muted', `\n  \u2026and ${matches.length - 8} more`);
			}
			return new SimpleText(text);
		},
	};
}

function sessionDashboardRenderers(): ToolRenderers {
	return {
		renderCall(_args, theme) {
			return new SimpleText(theme.fg('toolTitle', theme.bold('session dashboard')));
		},
		renderResult(result, { isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'Loading dashboard\u2026'));
			const raw = resultText(result);
			const summary = truncate(raw.replace(/\n/g, ' '), 80);
			return new SimpleText(theme.fg('toolOutput', summary || 'OK'));
		},
	};
}

// ──────────────────────────────────────────────
// Registry
function taskRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const agent = String(args['subagent_type'] ?? '?');
			const desc = String(args['description'] ?? '');
			let text = theme.fg('accent', safeLine(agent));
			if (desc) text += theme.fg('dim', ` — ${truncate(desc, 60)}`);
			return new Text(text, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg('warning', 'running...'), 0, 0);
			const raw = resultText(result);
			const lineCount = raw.split('\n').length;

			// Detect agent failure — result starts with "Agent X failed:"
			const isError = raw.startsWith('Agent ') && raw.includes('failed:');
			if (isError) {
				const bgFn = (t: string) => theme.bg('toolErrorBg', t);
				const box = new Box(1, 0, bgFn);
				let errorContent = theme.fg('error', 'failed');
				if (expanded) {
					errorContent += '\n' + theme.fg('error', raw.split('\n').slice(0, 10).map(safeLine).join('\n'));
				} else {
					// Show first line of error in collapsed view
					const firstLine = raw.split('\n')[0] || '';
					errorContent += theme.fg('dim', '  ' + firstLine.slice(0, 80));
					errorContent += theme.fg('muted', '  ctrl+o / ctrl+t');
				}
				box.addChild(new Text(errorContent, 0, 0));
				return box;
			}

			// Try to extract token stats from the appended footer
			// Pattern: _agent: Xms | Y in Z out tokens | $cost_
			const statsMatch = raw.match(/_(\w+): (\d+)ms \| (\d+) in (\d+) out tokens \| \$([0-9.]+)_/);

			let text = theme.fg('success', 'done');
			if (statsMatch) {
				const [, , durationMs, tokIn, tokOut, cost] = statsMatch;
				const duration =
					Number(durationMs) >= 1000
						? `${(Number(durationMs) / 1000).toFixed(1)}s`
						: `${durationMs}ms`;
				text += theme.fg('dim', `  ${duration}  \u2191${tokIn} \u2193${tokOut} $${cost}`);
			} else {
				text += theme.fg('dim', ` (${lineCount} lines)`);
			}

			if (!expanded) {
				text += theme.fg('muted', '  ctrl+o / ctrl+t');
			}
			if (expanded) {
				const preview = raw.split('\n').slice(0, 20).map(safeLine).join('\n');
				text += '\n' + theme.fg('dim', preview);
				if (lineCount > 20) text += theme.fg('muted', '\n...more');
			}
			return new Text(text, 0, 0);
		},
	};
}

function parallelTasksRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const tasks = (args['tasks'] as Array<Record<string, unknown>>) ?? [];
			const agents = tasks.map(t => String(t['subagent_type'] ?? '?'));
			const text = theme.fg('accent', agents.join(' + '));
			return new Text(safeLine(text), 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg('warning', 'running...'), 0, 0);
			const raw = resultText(result);

			// Parse agent names and statuses from ### headers in the raw output
			// Format: "### agent_name (Xms)" for success, "### agent_name (FAILED)" for failure
			const agentEntries: Array<{ name: string; failed: boolean }> = [];
			const headerPattern = /^### (\S+) \((?:FAILED|(\d+)ms)\)/gm;
			let match: RegExpExecArray | null;
			while ((match = headerPattern.exec(raw)) !== null) {
				agentEntries.push({ name: match[1] ?? '?', failed: match[2] === undefined });
			}

			// Build chain visualization with status icons
			// ✓ = success (green), ✗ = failed (red)
			const chain = agentEntries
				.map(({ name, failed }) => {
					const icon = failed
						? theme.fg('error', '\u2717') // ✗
						: theme.fg('success', '\u2713'); // ✓
					const nameColor = failed ? 'error' : 'dim';
					return `${icon} ${theme.fg(nameColor as 'dim' | 'error', name)}`;
				})
				.join('  ');

			const lineCount = raw.split('\n').length;
			const hasFailures = agentEntries.some(e => e.failed);

			// Build summary header
			let summaryText = chain;
			summaryText += '\n' + theme.fg(hasFailures ? 'error' : 'success', hasFailures ? 'done (with failures)' : 'done');
			summaryText += theme.fg('dim', ` (${lineCount} lines)`);

			if (!expanded) {
				summaryText += theme.fg('muted', '  ctrl+o / ctrl+t');
				return new Text(summaryText, 0, 0);
			}

			// Expanded view: use Container to group summary + agent sections
			const container = new Container();
			container.addChild(new Text(summaryText, 0, 0));

			// Split by ### headers to show each agent section separately
			const sections = raw.split(/(?=^### )/m);
			for (const section of sections) {
				const trimmed = section.trim();
				if (!trimmed) continue;
				const isFailed = trimmed.includes('(FAILED)');
				const lines = trimmed.split('\n');
				const preview = lines.slice(0, 15).map(safeLine).join('\n');
				let sectionContent = preview;
				if (lines.length > 15) {
					sectionContent += '\n' + theme.fg('muted', `  ...${lines.length - 15} more lines`);
				}

				if (isFailed) {
					// Failed sections get error background via Box
					const box = new Box(1, 0, (t: string) => theme.bg('toolErrorBg', t));
					box.addChild(new Text(theme.fg('error', sectionContent), 0, 0));
					container.addChild(box);
				} else {
					container.addChild(new Text(theme.fg('dim', sectionContent), 0, 0));
				}
			}

			return container;
		},
	};
}

// ──────────────────────────────────────────────

const RENDERERS: Record<string, () => ToolRenderers> = {
	memory_service_search: memorySearchRenderers,
	memory_service_store: memoryStoreRenderers,
	memory_service_get: memoryGetRenderers,
	memory_service_update: memoryUpdateRenderers,
	memory_service_delete: memoryDeleteRenderers,
	memory_service_list: memoryListRenderers,
	context7_search: context7SearchRenderers,
	grep_app_search: grepAppSearchRenderers,
	session_dashboard: sessionDashboardRenderers,
	task: taskRenderers,
	parallel_tasks: parallelTasksRenderers,
};

/**
 * Look up renderCall / renderResult functions for a Hub tool.
 * Returns undefined for tools without custom rendering.
 */
export function getToolRenderers(toolName: string): ToolRenderers | undefined {
	const factory = RENDERERS[toolName];
	return factory?.();
}
