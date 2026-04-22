import { describe, expect, it } from 'bun:test';
import {
	AGENTUITY_CLI_MARK,
	formatToolDisplay,
	getAgentuityCliCommandRemainder,
} from '../src/agentuity-cli.ts';
import { buildProjectionFromEntries } from '../src/hub-overlay-state.ts';
import { getToolRenderers } from '../src/renderers.ts';

const testTheme = {
	fg: (_color: string, text: string) => text,
	bg: (_color: string, text: string) => text,
	bold: (text: string) => text,
} as const;

describe('agentuity CLI display helpers', () => {
	it('detects direct and wrapped agentuity CLI commands', () => {
		expect(getAgentuityCliCommandRemainder('agentuity cloud task list --org-id org_123')).toBe(
			'cloud task list --org-id org_123'
		);
		expect(
			getAgentuityCliCommandRemainder(
				'AGENTUITY_PROFILE=local bunx --bun @agentuity/cli cloud sandbox list'
			)
		).toBe('cloud sandbox list');
		expect(getAgentuityCliCommandRemainder('pnpm dlx @agentuity/cli cloud deployment list')).toBe(
			'cloud deployment list'
		);
		expect(getAgentuityCliCommandRemainder('echo agentuity')).toBeNull();
	});

	it('brands command-tool displays for Agentuity CLI invocations', () => {
		expect(
			formatToolDisplay('bash', {
				command: 'agentuity cloud task list --org-id org_123',
			})
		).toEqual({
			toolName: `${AGENTUITY_CLI_MARK} agentuity`,
			toolArgs: 'cloud task list --org-id org_123',
			fullLabel: `${AGENTUITY_CLI_MARK} agentuity cloud task list --org-id org_123`,
			branded: true,
		});

		expect(
			formatToolDisplay('bash', {
				command: 'bun test packages/coder-tui/test/agentuity-cli.test.ts',
			})
		).toEqual({
			toolName: 'bash',
			toolArgs: 'bun test packages/coder-tui/test/agentuity-cli.test.ts',
			fullLabel: 'bash bun test packages/coder-tui/test/agentuity-cli.test.ts',
			branded: false,
		});
	});

	it('normalizes multiline command previews into single-line labels', () => {
		expect(
			formatToolDisplay('bash', {
				command: 'bun test\n\tpackages/coder-tui/test/agentuity-cli.test.ts',
			})
		).toEqual({
			toolName: 'bash',
			toolArgs: 'bun test packages/coder-tui/test/agentuity-cli.test.ts',
			fullLabel: 'bash bun test packages/coder-tui/test/agentuity-cli.test.ts',
			branded: false,
		});
	});

	it('brands the local TUI command row for Agentuity CLI calls', () => {
		const renderers = getToolRenderers('bash');
		const component = renderers?.renderCall?.(
			{ command: 'agentuity auth whoami', timeout: 45 },
			testTheme as never
		) as { render: (width: number) => string[] } | undefined;

		expect(component?.render(120).join('\n')).toContain(
			`${AGENTUITY_CLI_MARK} agentuity auth whoami (timeout 45s)`
		);
	});

	it('keeps local non-branded command rows single-line', () => {
		const renderers = getToolRenderers('bash');
		const component = renderers?.renderCall?.(
			{
				command: 'bun test\n\tpackages/coder-tui/test/agentuity-cli.test.ts',
				timeout: 45,
			},
			testTheme as never
		) as { render: (width: number) => string[] } | undefined;

		expect(component?.render(120)).toEqual([
			'$ bun test packages/coder-tui/test/agentuity-cli.test.ts (timeout 45s)',
		]);
	});

	it('rebuilds projection output with Agentuity-branded tool calls', () => {
		expect(
			buildProjectionFromEntries([
				{
					type: 'tool_call',
					toolName: 'bash',
					toolArgs: { command: 'agentuity cloud task list' },
				},
			])
		).toEqual({
			output: `[tool_call] ${AGENTUITY_CLI_MARK} agentuity cloud task list\n\n`,
			thinking: '',
			tasks: {},
		});
	});
});
