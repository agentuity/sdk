import { createAgent, type AppState } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const lifecycleAgent = createAgent({
	metadata: {
		name: 'Lifecycle Test Agent',
		description: 'Agent that tests lifecycle setup and shutdown methods',
	},
	schema: {
		input: s.object({
			message: s.string(),
		}),
		output: s.object({
			result: s.string(),
			appName: s.string(),
			agentId: s.string(),
		}),
	},
	setup: async (app: AppState) => {
		// Validate app state is available and typed
		console.log('🔧 [LIFECYCLE AGENT] Setup started');
		console.log('   ✅ App name:', app.appName);
		console.log('   ✅ App version:', app.version);
		console.log('   ✅ App started at:', app.startedAt);
		console.log('   ✅ Max connections:', app.config.maxConnections);
		console.log('   ✅ Timeout:', app.config.timeout);

		// Initialize agent-specific resources
		// Return value type is inferred automatically
		return {
			agentId: `agent-${Math.random().toString(36).substr(2, 9)}`,
			connectionPool: ['conn-1', 'conn-2', 'conn-3'],
			setupTime: new Date(),
		};
	},
	handler: async (ctx, input) => {
		// Validate both app state and agent config are available and typed
		// Config type is now automatically inferred from setup return value!
		console.log('🚀 [LIFECYCLE AGENT] Handler started');
		console.log('   📊 App state available:', !!ctx.app);
		console.log('   📊 App name:', ctx.app.appName);
		console.log('   📊 App version:', ctx.app.version);
		console.log('   📊 App config timeout:', ctx.app.config.timeout);
		console.log('   📊 Agent config available:', !!ctx.config);
		console.log('   📊 Agent ID:', ctx.config.agentId);
		console.log('   📊 Connection pool size:', ctx.config.connectionPool.length);
		console.log('   📊 Agent setup time:', ctx.config.setupTime);
		console.log('   📊 Input message:', input.message);

		// Use the app and agent state
		// Types are inferred: ctx.config.setupTime is Date, ctx.app.startedAt is Date
		const uptime = Date.now() - ctx.app.startedAt.getTime();
		const agentRuntime = Date.now() - ctx.config.setupTime.getTime();

		console.log('   ⏱️  App uptime:', uptime, 'ms');
		console.log('   ⏱️  Agent runtime:', agentRuntime, 'ms');

		return {
			result: `Processed: ${input.message}`,
			appName: ctx.app.appName,
			agentId: ctx.config.agentId,
		};
	},
	shutdown: async (app, config) => {
		// Validate shutdown receives both app state and agent config
		console.log('🛑 [LIFECYCLE AGENT] Shutdown started');
		console.log('   ✅ App name:', app.appName);
		console.log('   ✅ App started at:', app.startedAt);
		console.log('   ✅ Agent ID:', config.agentId);
		console.log('   ✅ Connection pool:', config.connectionPool);
		console.log('   ✅ Cleaning up connections...');

		// Simulate cleanup
		for (const conn of config.connectionPool) {
			console.log('      - Closing:', conn);
		}

		console.log('🛑 [LIFECYCLE AGENT] Shutdown completed');
	},
});

// Add event listeners
// Both ctx.app and ctx.config are now fully typed automatically!
// No need for manual type extraction - the types flow through from setup/createApp

lifecycleAgent.addEventListener('started', (_eventName, _agent, ctx) => {
	// ctx.config is automatically typed from setup return value
	console.log('🎯 [LIFECYCLE EVENT] Agent started');
	console.log('   📊 App name:', ctx.app.appName);
	console.log('   📊 Agent ID from config:', ctx.config.agentId);
	console.log('   📊 Connection pool size:', ctx.config.connectionPool.length);
});

lifecycleAgent.addEventListener('completed', (_eventName, _agent, ctx) => {
	// ctx.config.setupTime is correctly typed as Date
	console.log('🎯 [LIFECYCLE EVENT] Agent completed');
	console.log('   📊 Config setup time:', ctx.config.setupTime);
});

export default lifecycleAgent;
