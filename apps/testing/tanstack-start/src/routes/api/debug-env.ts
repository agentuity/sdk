import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/debug-env')({
	server: {
		handlers: {
			GET: async () => {
				return new Response(
					JSON.stringify({
						OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
						OPENAI_API_KEY_prefix: process.env.OPENAI_API_KEY?.slice(0, 10) ?? 'NOT SET',
						OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? 'NOT SET',
						ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
						ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? 'NOT SET',
						AGENTUITY_SDK_KEY: !!process.env.AGENTUITY_SDK_KEY,
						AGENTUITY_SDK_KEY_prefix:
							process.env.AGENTUITY_SDK_KEY?.slice(0, 10) ?? 'NOT SET',
						AGENTUITY_TRANSPORT_URL: process.env.AGENTUITY_TRANSPORT_URL ?? 'NOT SET',
					}),
					{ headers: { 'Content-Type': 'application/json' } }
				);
			},
		},
	},
});
