import type { HubAction } from './protocol.ts';

export interface ActionResult {
	block?: { block: true; reason: string };
	returnValue?: unknown;
	systemPrompt?: string;
	systemPromptMode?: 'replace' | 'prefix' | 'suffix';
	// undefined means ACK (proceed normally)
}

/** Minimal UI surface used by action handlers — avoids a hard dep on pi-coding-agent. */
interface ActionContext {
	ui?: {
		notify(message: string, level?: 'info' | 'warning' | 'error'): void;
		confirm(title: string, message: string): Promise<boolean>;
		setStatus(key: string, text?: string): void;
	};
	sendUserMessage?: (message: string, options?: { deliverAs?: 'followUp' }) => void;
}

export async function processActions(
	actions: HubAction[],
	ctx: ActionContext
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
					const confirmed = await ctx.ui.confirm(action.title, action.message);
					if (!confirmed) {
						return {
							block: {
								block: true,
								reason: action.deny_reason ?? 'Denied by user',
							},
						};
					}
				} else {
					// No UI available — block by default for safety
					result = {
						block: {
							block: true,
							reason: action.deny_reason ?? 'Confirmation required but no UI available',
						},
					};
				}
				break;
			}

			case 'SYSTEM_PROMPT':
				// System prompt injection — store for before_agent_start handler
				result = {
					...result,
					systemPrompt: action.systemPrompt,
					systemPromptMode: action.mode,
				};
				break;

			case 'INJECT_MESSAGE': {
				const content = action.message?.content?.trim();
				if (!content) break;

				if (action.message?.role === 'user') {
					if (ctx.sendUserMessage) {
						ctx.sendUserMessage(content, { deliverAs: 'followUp' });
					} else if (ctx.ui) {
						ctx.ui.notify(content, 'info');
					}
					break;
				}

				if (ctx.ui) {
					ctx.ui.notify(content, 'info');
				}
				break;
			}
		}
	}

	return result;
}
