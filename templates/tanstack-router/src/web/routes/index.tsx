/**
 * Home Route - TanStack Router
 *
 * This is the index route, rendered at the root path "/".
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
	component: HomeComponent,
});

function HomeComponent() {
	return (
		<div className="page">
			<div className="header">
				<svg
					aria-hidden="true"
					aria-label="Agentuity Logo"
					className="logo"
					fill="none"
					height="191"
					viewBox="0 0 220 191"
					width="220"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						clipRule="evenodd"
						d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
						fill="#00FFFF"
						fillRule="evenodd"
					/>
					<path
						clipRule="evenodd"
						d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
						fill="#00FFFF"
						fillRule="evenodd"
					/>
				</svg>

				<h1 className="title">Welcome to Agentuity</h1>

				<p className="subtitle">
					The <span className="italic">Full-Stack</span> Platform for AI Agents
				</p>

				<p className="subtitle">
					Using <span className="highlight">TanStack Router</span> for file-based routing
				</p>
			</div>

			<div className="card">
				<h2 className="card-title">File-Based Routing</h2>
				<p className="card-text">
					This template uses TanStack Router with file-based routing. Routes are automatically
					discovered from the <code>src/web/routes/</code> directory.
				</p>
				<ul className="list">
					<li>
						<code>__root.tsx</code> - Root layout with navigation
					</li>
					<li>
						<code>index.tsx</code> - Home page (this page)
					</li>
					<li>
						<code>about.tsx</code> - About page
					</li>
					<li>
						<code>hello.tsx</code> - Hello Agent demo
					</li>
				</ul>
			</div>

			<style>
				{`
					.page {
						display: flex;
						flex-direction: column;
						gap: 2rem;
					}

					.header {
						text-align: center;
						margin-bottom: 1rem;
					}

					.logo {
						height: auto;
						margin-bottom: 1rem;
						width: 3rem;
					}

					.title {
						font-size: 3rem;
						font-weight: 100;
						margin: 0;
					}

					.subtitle {
						color: #a1a1aa;
						font-size: 1.15rem;
						margin: 0.5rem 0;
					}

					.italic {
						font-family: Georgia, "Times New Roman", Times, serif;
						font-style: italic;
						font-weight: 100;
					}

					.highlight {
						color: #22d3ee;
					}

					.card {
						background: #000;
						border: 1px solid #18181b;
						border-radius: 0.5rem;
						padding: 2rem;
					}

					.card-title {
						color: #fff;
						font-size: 1.25rem;
						font-weight: 400;
						margin: 0 0 1rem 0;
					}

					.card-text {
						color: #a1a1aa;
						margin: 0 0 1rem 0;
						line-height: 1.6;
					}

					.card-text code {
						color: #22d3ee;
						background: #164e63;
						padding: 0.125rem 0.375rem;
						border-radius: 0.25rem;
					}

					.list {
						color: #a1a1aa;
						margin: 0;
						padding-left: 1.5rem;
						line-height: 2;
					}

					.list code {
						color: #fff;
					}
				`}
			</style>
		</div>
	);
}
