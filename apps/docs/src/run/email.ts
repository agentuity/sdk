/**
 * Standalone invoke script for Email Agent
 *
 * Uses ctx.invoke() with agent.run() pattern (SDK 0.1.14+)
 *
 * Usage: bun run src/run/email.ts '{"template":"welcome"}'
 */
import { createAgentContext } from '@agentuity/runtime';
import emailAgent from '../agent/email/agent';

const ctx = createAgentContext();
const OUTBOUND_POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 750;
type EmailOutboundRecord = { status?: string } | null;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function waitForOutboundStatus(outboundId: string) {
	let outbound: EmailOutboundRecord = null;

	for (let attempt = 0; attempt < OUTBOUND_POLL_ATTEMPTS; attempt += 1) {
		outbound = await ctx.email.getOutbound(outboundId).catch((error) => {
			ctx.logger.warn('Email delivery lookup failed', {
				error: error instanceof Error ? error.message : String(error),
				emailId: outboundId,
			});

			return null;
		});

		if (outbound?.status && outbound.status !== 'pending') {
			return outbound;
		}

		if (attempt < OUTBOUND_POLL_ATTEMPTS - 1) {
			await sleep(POLL_INTERVAL_MS);
		}
	}

	return outbound;
}

try {
	const input = JSON.parse(process.argv[2] ?? '{"template":"welcome"}');
	const result = await ctx.invoke(() => emailAgent.run(input));
	const outbound = await waitForOutboundStatus(result.id);

	console.log('---OUTPUT---');
	console.log(
		JSON.stringify(
			{
				status: outbound?.status ?? result.status,
				subject: result.subject,
				to: result.to,
				from: result.from,
			},
			null,
			2
		)
	);
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
