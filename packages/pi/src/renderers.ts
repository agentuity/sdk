/**
 * TUI tool renderers for Hub tools.
 *
 * Each renderer provides a compact renderCall (one-line summary of the invocation)
 * and a renderResult (collapsed / expanded views of the result).
 * Renderers are looked up by tool name and spread into the registerTool() call.
 */

import type { Theme, ToolRenderResultOptions, AgentToolResult } from '@mariozechner/pi-coding-agent';

// ──────────────────────────────────────────────
// Minimal text component compatible with Pi's Component interface.
// We avoid importing @mariozechner/pi-tui directly since it's a transitive
// dependency — this class matches the Text component's behaviour.
// ──────────────────────────────────────────────

export class SimpleText {
	private text: string;

	constructor(text: string) {
		this.text = text;
	}

	render(_width: number): string[] {
		return this.text.split('\n');
	}

	invalidate(): void {
		// no-op — we don't cache
	}
}

// ──────────────────────────────────────────────
// Types matching Pi's ToolDefinition.renderCall / renderResult
// ──────────────────────────────────────────────

type RenderCallFn = (args: Record<string, unknown>, theme: Theme) => SimpleText;
type RenderResultFn = (
	result: AgentToolResult<unknown>,
	options: ToolRenderResultOptions,
	theme: Theme,
) => SimpleText;

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
					const key = String(item['key'] ?? item['id'] ?? '?');
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
					? JSON.stringify(parsed, null, 2).split('\n').slice(0, 10).join('\n')
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
					`  ${theme.fg('accent', String(k))}`,
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
			let text = theme.fg('accent', agent);
			if (desc) text += theme.fg('dim', ` ${desc}`);
			return new SimpleText(text);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'running...'));
			const raw = resultText(result);
			const lineCount = raw.split('\n').length;
			let text = theme.fg('success', 'done');
			text += theme.fg('dim', ` (${lineCount} lines)`);
			if (!expanded) {
				text += theme.fg('muted', '  ctrl+o tools / ctrl+t thinking');
			}
			if (expanded) {
				const preview = raw.split('\n').slice(0, 20).join('\n');
				text += '\n' + theme.fg('dim', preview);
				if (lineCount > 20) text += theme.fg('muted', '\n...more');
			}
			return new SimpleText(text);
		},
	};
}

function parallelTasksRenderers(): ToolRenderers {
	return {
		renderCall(args, theme) {
			const tasks = (args['tasks'] as Array<Record<string, unknown>>) ?? [];
			const agents = tasks.map(t => String(t['subagent_type'] ?? '?'));
			let text = theme.fg('accent', agents.join(' + '));
			text += theme.fg('dim', ` (${tasks.length} tasks)`);
			return new SimpleText(text);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new SimpleText(theme.fg('warning', 'running...'));
			const raw = resultText(result);
			const lineCount = raw.split('\n').length;
			let text = theme.fg('success', 'done');
			text += theme.fg('dim', ` (${lineCount} lines)`);
			if (!expanded) {
				text += theme.fg('muted', '  ctrl+o tools / ctrl+t thinking');
			}
			if (expanded) {
				const preview = raw.split('\n').slice(0, 20).join('\n');
				text += '\n' + theme.fg('dim', preview);
				if (lineCount > 20) text += theme.fg('muted', '\n...more');
			}
			return new SimpleText(text);
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
