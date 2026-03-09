import type { ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { RpcUiRequest } from './remote-session.ts';

export const REMOTE_FIRE_AND_FORGET_UI_METHODS = new Set([
	'notify',
	'setStatus',
	'setWidget',
	'setTitle',
	'set_editor_text',
]);

export async function handleRemoteUiRequest(
	ctx: ExtensionContext,
	request: RpcUiRequest
): Promise<unknown> {
	if (!ctx.hasUI) {
		return REMOTE_FIRE_AND_FORGET_UI_METHODS.has(request.method) ? undefined : null;
	}

	const ui = ctx.ui;

	switch (request.method) {
		case 'select': {
			const options = Array.isArray(request.params.options)
				? request.params.options.filter(
						(option): option is string => typeof option === 'string'
					)
				: [];
			const title = (request.params.title as string) ?? 'Select';
			return (await ui.select(title, options)) ?? null;
		}
		case 'confirm':
			return await ui.confirm(
				(request.params.title as string) ?? 'Confirm?',
				(request.params.message as string) ?? 'Confirm?'
			);
		case 'input':
			return (
				(await ui.input(
					(request.params.title as string) ?? 'Input',
					(request.params.placeholder as string) ?? ''
				)) ?? null
			);
		case 'editor':
			return (
				(await ui.editor(
					(request.params.title as string) ?? 'Editor',
					(request.params.prefill as string) ?? ''
				)) ?? null
			);
		case 'notify':
			ui.notify(
				(request.params.message as string) ?? '',
				(request.params.notifyType as 'info' | 'warning' | 'error' | undefined) ?? 'info'
			);
			return undefined;
		case 'setStatus':
			ui.setStatus(
				(request.params.statusKey as string) ?? 'remote',
				(request.params.statusText as string | undefined) ?? undefined
			);
			return undefined;
		case 'setWidget': {
			const widgetLines = Array.isArray(request.params.widgetLines)
				? request.params.widgetLines.filter((line): line is string => typeof line === 'string')
				: undefined;
			const widgetPlacement = request.params.widgetPlacement;
			ui.setWidget(
				(request.params.widgetKey as string) ?? 'remote_widget',
				widgetLines,
				widgetPlacement === 'aboveEditor' || widgetPlacement === 'belowEditor'
					? { placement: widgetPlacement }
					: undefined
			);
			return undefined;
		}
		case 'setTitle':
			ui.setTitle((request.params.title as string) ?? '');
			return undefined;
		case 'set_editor_text':
			ui.setEditorText((request.params.text as string) ?? '');
			return undefined;
		default:
			return null;
	}
}
