export function buildInboundRpcPromptText(command: Record<string, unknown>): string | null {
	const rawText =
		typeof command.message === 'string'
			? command.message
			: typeof command.text === 'string'
				? command.text
				: '';
	const promptText = rawText.trim();
	if (!promptText) return null;

	const targetAgent =
		typeof command.agent === 'string'
			? command.agent.trim()
			: typeof command.targetAgent === 'string'
				? command.targetAgent.trim()
				: '';
	if (targetAgent && targetAgent !== 'lead') {
		return `@${targetAgent} ${promptText}`;
	}

	return promptText;
}

export function getInboundRpcDeliverAs(
	commandType: string,
	isIdle: boolean
): 'steer' | 'followUp' | undefined {
	if (commandType === 'steer') {
		return isIdle ? undefined : 'steer';
	}
	if (commandType === 'prompt' || commandType === 'follow_up') {
		return isIdle ? undefined : 'followUp';
	}
	return undefined;
}
