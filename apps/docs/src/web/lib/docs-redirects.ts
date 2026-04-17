export const docsRedirects = {
	demo: '/explorer',
	explorerEvals: '/cookbook/patterns/llm-as-a-judge',
	apis: '/agents',
	apisCallingAgents: '/routes/calling-agents',
	apisWhenToUse: '/agents/when-to-use',
	agentsWorkbench: '/agents',
	frontendWorkbench: '/frontend',
	agentsEvaluations: '/cookbook/patterns/llm-as-a-judge',
	referenceApiEvaluations: '/reference/api',
	referenceSdkEvaluations: '/reference/sdk-reference',
} as const;

export const docRedirectRules = [
	{ paths: ['/demo', '/demo/'], target: docsRedirects.demo },
	{ paths: ['/explorer/evals', '/explorer/evals/'], target: docsRedirects.explorerEvals },
	{ paths: ['/apis', '/apis/'], target: docsRedirects.apis },
	{
		paths: ['/apis/calling-agents', '/apis/calling-agents/'],
		target: docsRedirects.apisCallingAgents,
	},
	{ paths: ['/apis/when-to-use', '/apis/when-to-use/'], target: docsRedirects.apisWhenToUse },
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
