import { describe, expect, it } from 'bun:test';
import { handleRemoteUiRequest } from '../src/remote-ui-handler.ts';

function createUiContext() {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const ui = {
		select: async (title: string, options: string[]) => {
			calls.push({ method: 'select', args: [title, options] });
			return options[1];
		},
		confirm: async (title: string, message: string) => {
			calls.push({ method: 'confirm', args: [title, message] });
			return true;
		},
		input: async (title: string, placeholder?: string) => {
			calls.push({ method: 'input', args: [title, placeholder] });
			return 'typed';
		},
		editor: async (title: string, prefill?: string) => {
			calls.push({ method: 'editor', args: [title, prefill] });
			return 'edited';
		},
		notify: (message: string, type?: string) => {
			calls.push({ method: 'notify', args: [message, type] });
		},
		setStatus: (key: string, text?: string) => {
			calls.push({ method: 'setStatus', args: [key, text] });
		},
		setWidget: (key: string, lines: string[] | undefined, options?: unknown) => {
			calls.push({ method: 'setWidget', args: [key, lines, options] });
		},
		setTitle: (title: string) => {
			calls.push({ method: 'setTitle', args: [title] });
		},
		setEditorText: (text: string) => {
			calls.push({ method: 'set_editor_text', args: [text] });
		},
	};

	return {
		ctx: {
			hasUI: true,
			ui,
		} as any,
		calls,
	};
}

describe('handleRemoteUiRequest', () => {
	it('maps blocking dialog methods to Pi UI APIs', async () => {
		const { ctx, calls } = createUiContext();

		const selectResult = await handleRemoteUiRequest(ctx, {
			id: 'ui-1',
			method: 'select',
			params: {
				title: 'Choose',
				options: ['A', 'B'],
			},
		});
		const inputResult = await handleRemoteUiRequest(ctx, {
			id: 'ui-2',
			method: 'input',
			params: {
				title: 'Enter',
				placeholder: 'name',
			},
		});

		expect(selectResult).toBe('B');
		expect(inputResult).toBe('typed');
		expect(calls[0]).toEqual({ method: 'select', args: ['Choose', ['A', 'B']] });
		expect(calls[1]).toEqual({ method: 'input', args: ['Enter', 'name'] });
	});

	it('maps fire-and-forget methods to status, widget, and editor updates', async () => {
		const { ctx, calls } = createUiContext();

		await handleRemoteUiRequest(ctx, {
			id: 'ui-3',
			method: 'setStatus',
			params: {
				statusKey: 'remote',
				statusText: 'Busy',
			},
		});
		await handleRemoteUiRequest(ctx, {
			id: 'ui-4',
			method: 'setWidget',
			params: {
				widgetKey: 'remote_widget',
				widgetLines: ['line 1', 'line 2'],
				widgetPlacement: 'belowEditor',
			},
		});
		await handleRemoteUiRequest(ctx, {
			id: 'ui-5',
			method: 'set_editor_text',
			params: {
				text: 'new text',
			},
		});

		expect(calls).toContainEqual({ method: 'setStatus', args: ['remote', 'Busy'] });
		expect(calls).toContainEqual({
			method: 'setWidget',
			args: ['remote_widget', ['line 1', 'line 2'], { placement: 'belowEditor' }],
		});
		expect(calls).toContainEqual({ method: 'set_editor_text', args: ['new text'] });
	});
});
