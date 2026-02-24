import type { HubAction } from './protocol.ts';

// The ctx parameter is typed as `any` since we don't want a hard dependency on pi-coding-agent types at runtime
// The extension entry point passes the real ExtensionContext

export interface ActionResult {
	block?: { block: true; reason: string };
	returnValue?: unknown;
	// undefined means ACK (proceed normally)
}

export async function processActions(
	actions: HubAction[],
	ctx: any,
): Promise<ActionResult> {
	let result: ActionResult = {};

	for (const action of actions) {
		switch (action.action) {
			case 'ACK':
				// Terminal: proceed normally
				result = {};
				break;

			case 'BLOCK':
				// Terminal: block
				result = { block: { block: true, reason: action.reason } };
				break;

			case 'RETURN':
				// Terminal: return a specific result
				result = { returnValue: action.result };
				break;

			case 'NOTIFY':
				// Side effect: show notification, continue
				if (ctx?.ui) {
					ctx.ui.notify(action.message, action.level ?? 'info');
				}
				break;

			case 'STATUS':
				// Side effect: set status, continue
				if (ctx?.ui) {
					ctx.ui.setStatus(action.key, action.text);
				}
				break;

			case 'CONFIRM': {
				// Gate: if user denies, stop and block
				if (ctx?.ui) {
					const confirmed = await ctx.ui.confirm(
						action.title,
						action.message,
					);
					if (!confirmed) {
						return {
							block: {
								block: true,
								reason: action.deny_reason ?? 'Denied by user',
							},
						};
					}
				}
				break;
			}
		}
	}

	return result;
}
