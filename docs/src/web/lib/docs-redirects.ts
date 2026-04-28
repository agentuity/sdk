export const docsRedirects = {
	demo: '/explorer',
	explorerEvals: '/cookbook/patterns/llm-as-a-judge',
	apis: '/patterns/agents-as-a-pattern',
	apisCallingAgents: '/patterns/agents-as-a-pattern',
	apisWhenToUse: '/patterns/agents-as-a-pattern',
	agentsWorkbench: '/patterns/agents-as-a-pattern',
	agentsAiGateway: '/services/ai-gateway',
	agentsStreaming: '/patterns/chat-and-streaming',
	routesStreaming: '/patterns/chat-and-streaming',
	frontendWorkbench: '/frontend',
	agentsEvaluations: '/cookbook/patterns/llm-as-a-judge',
	referenceApiEvaluations: '/reference/api',
	referenceSdkEvaluations: '/reference/sdk-reference',
} as const;

export const docRedirectRules = [
	{ paths: ['/demo', '/demo/'], target: docsRedirects.demo },
	{ paths: ['/explorer/evals', '/explorer/evals/'], target: docsRedirects.explorerEvals },
	{ paths: ['/apis', '/apis/'], target: docsRedirects.apis },
	{ paths: ['/agents', '/agents/'], target: docsRedirects.apis },
	{
		paths: ['/apis/calling-agents', '/apis/calling-agents/'],
		target: docsRedirects.apisCallingAgents,
	},
	{ paths: ['/apis/when-to-use', '/apis/when-to-use/'], target: docsRedirects.apisWhenToUse },
	{
		paths: ['/agents/ai-gateway', '/agents/ai-gateway/'],
		target: docsRedirects.agentsAiGateway,
	},
	{
		paths: ['/agents/streaming-responses', '/agents/streaming-responses/'],
		target: docsRedirects.agentsStreaming,
	},
	{
		paths: ['/agents/calling-other-agents', '/agents/calling-other-agents/'],
		target: docsRedirects.apisCallingAgents,
	},
	{
		paths: ['/routes/sse', '/routes/sse/', '/routes/websockets', '/routes/websockets/'],
		target: docsRedirects.routesStreaming,
	},
	{ paths: ['/agents/workbench', '/agents/workbench/'], target: docsRedirects.agentsWorkbench },
	{
		paths: ['/frontend/workbench', '/frontend/workbench/'],
		target: docsRedirects.frontendWorkbench,
	},
	{
		paths: ['/agents/evaluations', '/agents/evaluations/'],
		target: docsRedirects.agentsEvaluations,
	},
	{
		paths: ['/reference/api/evaluations', '/reference/api/evaluations/'],
		target: docsRedirects.referenceApiEvaluations,
	},
	{
		paths: ['/reference/sdk-reference/evaluations', '/reference/sdk-reference/evaluations/'],
		target: docsRedirects.referenceSdkEvaluations,
	},
] as const;

export function getDemoRedirectTarget(rest: string | undefined): string {
	return rest ? `/explorer/${rest}` : docsRedirects.demo;
}
