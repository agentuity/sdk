export const docsRedirects = {
	demo: '/explorer',
	explorerEvals: '/build/agents',
	apis: '/build/agents',
	apisCallingAgents: '/build/agents',
	apisWhenToUse: '/build/agents',
	agentsWorkbench: '/build/agents',
	agentsAiGateway: '/services/ai-gateway',
	agentsStreaming: '/build/chat-and-streaming',
	routesStreaming: '/build/chat-and-streaming',
	patterns: '/build',
	patternsAgents: '/build/agents',
	patternsBackgroundWork: '/build/background-work',
	patternsChatStreaming: '/build/chat-and-streaming',
	frontend: '/frameworks',
	frontendRpcClient: '/cookbook/patterns/hono-rpc-tanstack-query',
	frontendAuthentication: '/services/authentication',
	frontendDeployment: '/deploy-operate/deploy-framework-apps',
	frontendWorkbench: '/migration/from-v2',
	referenceMigrationGuide: '/migration/from-v2',
	agentsEvaluations: '/build/agents',
	referenceApiEvaluations: '/reference/api',
	referenceSdkEvaluations: '/reference/sdk-reference',
	referenceSdkRuntime: '/migration/from-v2',
	referenceSdkStorage: '/services/storage',
	referenceSdkQueues: '/services/queues',
	referenceSdkTasks: '/services/tasks',
	referenceSdkEmail: '/services/email',
	referenceSdkSchedules: '/services/schedules',
	referenceSdkSandbox: '/services/sandbox',
	referenceSdkObservability: '/services/observability',
	communityInboundEmail: '/services/email',
	cookbookBackgroundTasks: '/build/background-work',
	cookbookCronStorage: '/services/schedules',
	cookbookLlmJudge: '/build/agents',
	cookbookProductSearch: '/services/storage/vector',
	cookbookWebExploration: '/services/sandbox',
	cookbookWebhookHandler: '/services/webhooks',
	cookbookResearch: '/build/agents',
	cookbookRag: '/services/storage/vector',
	cookbookUnderstandingAgents: '/build/agents',
	cookbookChatSdk: '/build/chat-and-streaming',
	cookbookProviderAgents: '/build/tool-calling',
	cookbookIntegrations: '/frameworks',
	cookbookTurborepo: '/frameworks',
	cookbookNextjs: '/frameworks/nextjs',
	cookbookTanstackStart: '/frameworks/tanstack-start',
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
	{ paths: ['/patterns', '/patterns/'], target: docsRedirects.patterns },
	{
		paths: ['/patterns/agents-as-a-pattern', '/patterns/agents-as-a-pattern/'],
		target: docsRedirects.patternsAgents,
	},
	{
		paths: ['/patterns/background-work', '/patterns/background-work/'],
		target: docsRedirects.patternsBackgroundWork,
	},
	{
		paths: ['/patterns/chat-and-streaming', '/patterns/chat-and-streaming/'],
		target: docsRedirects.patternsChatStreaming,
	},
	{ paths: ['/agents/workbench', '/agents/workbench/'], target: docsRedirects.agentsWorkbench },
	{ paths: ['/frontend', '/frontend/'], target: docsRedirects.frontend },
	{
		paths: [
			'/frontend/react-hooks',
			'/frontend/react-hooks/',
			'/frontend/provider-setup',
			'/frontend/provider-setup/',
			'/frontend/advanced-hooks',
			'/frontend/advanced-hooks/',
		],
		target: docsRedirects.frontend,
	},
	{
		paths: ['/frontend/rpc-client', '/frontend/rpc-client/'],
		target: docsRedirects.frontendRpcClient,
	},
	{
		paths: ['/frontend/authentication', '/frontend/authentication/'],
		target: docsRedirects.frontendAuthentication,
	},
	{
		paths: [
			'/frontend/deployment-scenarios',
			'/frontend/deployment-scenarios/',
			'/frontend/static-rendering',
			'/frontend/static-rendering/',
		],
		target: docsRedirects.frontendDeployment,
	},
	{
		paths: ['/frontend/workbench', '/frontend/workbench/'],
		target: docsRedirects.frontendWorkbench,
	},
	{
		paths: ['/agents/evaluations', '/agents/evaluations/'],
		target: docsRedirects.agentsEvaluations,
	},
	{
		paths: ['/reference/migration-guide', '/reference/migration-guide/'],
		target: docsRedirects.referenceMigrationGuide,
	},
	{
		paths: ['/reference/api/evaluations', '/reference/api/evaluations/'],
		target: docsRedirects.referenceApiEvaluations,
	},
	{
		paths: ['/reference/sdk-reference/evaluations', '/reference/sdk-reference/evaluations/'],
		target: docsRedirects.referenceSdkEvaluations,
	},
	{
		paths: [
			'/reference/sdk-reference/advanced',
			'/reference/sdk-reference/advanced/',
			'/reference/sdk-reference/agents',
			'/reference/sdk-reference/agents/',
			'/reference/sdk-reference/application-entry',
			'/reference/sdk-reference/application-entry/',
			'/reference/sdk-reference/context-api',
			'/reference/sdk-reference/context-api/',
			'/reference/sdk-reference/events',
			'/reference/sdk-reference/events/',
			'/reference/sdk-reference/router',
			'/reference/sdk-reference/router/',
		],
		target: docsRedirects.referenceSdkRuntime,
	},
	{
		paths: ['/reference/sdk-reference/storage', '/reference/sdk-reference/storage/'],
		target: docsRedirects.referenceSdkStorage,
	},
	{
		paths: ['/reference/sdk-reference/queue-service', '/reference/sdk-reference/queue-service/'],
		target: docsRedirects.referenceSdkQueues,
	},
	{
		paths: ['/reference/sdk-reference/task-service', '/reference/sdk-reference/task-service/'],
		target: docsRedirects.referenceSdkTasks,
	},
	{
		paths: ['/reference/sdk-reference/email-service', '/reference/sdk-reference/email-service/'],
		target: docsRedirects.referenceSdkEmail,
	},
	{
		paths: [
			'/reference/sdk-reference/schedule-service',
			'/reference/sdk-reference/schedule-service/',
		],
		target: docsRedirects.referenceSdkSchedules,
	},
	{
		paths: [
			'/reference/sdk-reference/sandbox-service',
			'/reference/sdk-reference/sandbox-service/',
		],
		target: docsRedirects.referenceSdkSandbox,
	},
	{
		paths: ['/reference/sdk-reference/observability', '/reference/sdk-reference/observability/'],
		target: docsRedirects.referenceSdkObservability,
	},
	{
		paths: ['/community/inbound-email-agent', '/community/inbound-email-agent/'],
		target: docsRedirects.communityInboundEmail,
	},
	{
		paths: [
			'/cookbook/tutorials/understanding-agents',
			'/cookbook/tutorials/understanding-agents/',
		],
		target: docsRedirects.cookbookUnderstandingAgents,
	},
	{
		paths: ['/cookbook/integrations/chat-sdk', '/cookbook/integrations/chat-sdk/'],
		target: docsRedirects.cookbookChatSdk,
	},
	{
		paths: ['/cookbook/integrations', '/cookbook/integrations/'],
		target: docsRedirects.cookbookIntegrations,
	},
	{
		paths: ['/cookbook/integrations/turborepo', '/cookbook/integrations/turborepo/'],
		target: docsRedirects.cookbookTurborepo,
	},
	{
		paths: ['/cookbook/integrations/nextjs', '/cookbook/integrations/nextjs/'],
		target: docsRedirects.cookbookNextjs,
	},
	{
		paths: ['/cookbook/integrations/tanstack-start', '/cookbook/integrations/tanstack-start/'],
		target: docsRedirects.cookbookTanstackStart,
	},
] as const;

export function getDemoRedirectTarget(rest: string | undefined): string {
	return rest ? `/explorer/${rest}` : docsRedirects.demo;
}
