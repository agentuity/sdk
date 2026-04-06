import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const lifecycleAgent = createAgent('lifecycle', {
	description: 'Agent that demonstrates agent-level setup and shutdown lifecycle hooks',
	schema: {
		input: s.object({
			message: s.string(),
		}),
		output: s.object({
			result: s.string(),
			agentId: s.string(),
		}),
	},
	setup: async () => {
		// Called once when the agent initializes. Use this to open connections,
		// load configuration, or allocate any resources the agent will reuse.
		console.log('🔧 [LIFECYCLE AGENT] Setup started');

		const agentId = `agent-${Math.random().toString(36).substr(2, 9)}`;
		const connectionPool = ['conn-1', 'conn-2', 'conn-3'];
		const setupTime = new Date();

		console.log('   Agent ID:', agentId);
		console.log('   Connection pool size:', connectionPool.length);
		console.log('   Setup time:', setupTime.toISOString());
		console.log('🔧 [LIFECYCLE AGENT] Setup complete');

		// The object returned here is available as ctx.config in the handler.
		return { agentId, connectionPool, setupTime };
	},
	handler: async (ctx, input) => {
		// ctx.config is typed from the setup return value — no casting needed.
		console.log('🚀 [LIFECYCLE AGENT] Handler started');
		console.log('   📊 Agent ID:', ctx.config.agentId);
		console.log('   📊 Connection pool size:', ctx.config.connectionPool.length);
		console.log('   📊 Agent setup time:', ctx.config.setupTime.toISOString());
		console.log('   📊 Input message:', input.message);

		const agentRuntime = Date.now() - ctx.config.setupTime.getTime();
		console.log('   ⏱️  Agent runtime:', agentRuntime, 'ms');

		return {
			result: `Processed: ${input.message}`,
			agentId: ctx.config.agentId,
		};
	},
	shutdown: async (_app, config) => {
		// Called when the agent is shutting down. Close connections and free resources.
		console.log('🛑 [LIFECYCLE AGENT] Shutdown started');
		console.log('   ✅ Agent ID:', config.agentId);
		console.log('   ✅ Cleaning up connection pool...');

		for (const conn of config.connectionPool) {
			console.log('      Closing:', conn);
		}

		console.log('🛑 [LIFECYCLE AGENT] Shutdown complete');
	},
});

lifecycleAgent.addEventListener('started', (_eventName, _agent, ctx) => {
	console.log('🎯 [LIFECYCLE EVENT] Agent started');
	console.log('   📊 Agent ID:', ctx.config.agentId);
	console.log('   📊 Connection pool size:', ctx.config.connectionPool.length);
});

lifecycleAgent.addEventListener('completed', (_eventName, _agent, ctx) => {
	console.log('🎯 [LIFECYCLE EVENT] Agent completed');
	console.log('   📊 Setup time:', ctx.config.setupTime.toISOString());
});

export default lifecycleAgent;
