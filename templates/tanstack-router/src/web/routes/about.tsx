/**
 * About Route - TanStack Router
 *
 * This route is rendered at "/about".
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/about')({
	component: AboutComponent,
});

function AboutComponent() {
	return (
		<div className="page">
			<h1 className="title">About</h1>

			<div className="card">
				<h2 className="card-title">TanStack Router + Agentuity</h2>
				<p className="card-text">
					This template demonstrates how to use TanStack Router with Agentuity's build system.
					File-based routing is configured in <code>agentuity.config.ts</code> using the
					TanStackRouterVite plugin.
				</p>
			</div>

			<div className="card">
				<h2 className="card-title">Configuration</h2>
				<pre className="code-block">
					{`// agentuity.config.ts
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

export default {
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/web/routes',
      generatedRouteTree: './src/web/routeTree.gen.ts',
    }),
  ],
} satisfies AgentuityConfig;`}
				</pre>
			</div>

			<div className="card">
				<h2 className="card-title">Learn More</h2>
				<ul className="list">
					<li>
						<a href="https://tanstack.com/router" target="_blank" rel="noopener noreferrer">
							TanStack Router Documentation
						</a>
					</li>
					<li>
						<a href="https://agentuity.dev" target="_blank" rel="noopener noreferrer">
							Agentuity Documentation
						</a>
					</li>
				</ul>
			</div>

			<style>
				{`
					.page {
						display: flex;
						flex-direction: column;
						gap: 1.5rem;
					}

					.title {
						font-size: 2rem;
						font-weight: 300;
						margin: 0;
					}

					.card {
						background: #000;
						border: 1px solid #18181b;
						border-radius: 0.5rem;
						padding: 1.5rem;
					}

					.card-title {
						color: #fff;
						font-size: 1.125rem;
						font-weight: 400;
						margin: 0 0 0.75rem 0;
					}

					.card-text {
						color: #a1a1aa;
						margin: 0;
						line-height: 1.6;
					}

					.card-text code {
						color: #22d3ee;
						background: #164e63;
						padding: 0.125rem 0.375rem;
						border-radius: 0.25rem;
					}

					.code-block {
						background: #09090b;
						border: 1px solid #27272a;
						border-radius: 0.375rem;
						color: #22d3ee;
						font-family: monospace;
						font-size: 0.875rem;
						line-height: 1.6;
						margin: 0;
						overflow-x: auto;
						padding: 1rem;
					}

					.list {
						color: #a1a1aa;
						margin: 0;
						padding-left: 1.5rem;
						line-height: 2;
					}

					.list a {
						color: #22d3ee;
						text-decoration: none;
					}

					.list a:hover {
						text-decoration: underline;
					}
				`}
			</style>
		</div>
	);
}
