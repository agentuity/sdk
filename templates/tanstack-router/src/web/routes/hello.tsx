/**
 * Hello Agent Route - TanStack Router
 *
 * This route demonstrates calling an Agentuity agent from a file-based route.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useAPI } from '@agentuity/react';
import { type ChangeEvent, useState } from 'react';

export const Route = createFileRoute('/hello')({
	component: HelloComponent,
});

function HelloComponent() {
	const [name, setName] = useState('World');
	const { data: greeting, invoke, isLoading: running } = useAPI('POST /api/hello');

	return (
		<div className="page">
			<h1 className="title">Hello Agent</h1>

			<div className="card">
				<h2 className="card-title">
					Try the <span className="highlight">Hello Agent</span>
				</h2>

				<div className="input-group">
					<input
						className="input"
						disabled={running}
						onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
						placeholder="Enter your name"
						type="text"
						value={name}
					/>

					<div className="glow-btn">
						<div className="glow-bg" />
						<div className="glow-effect" />
						<button
							className={`button ${running ? 'disabled' : ''}`}
							disabled={running}
							onClick={() => invoke({ name })}
							type="button"
						>
							{running ? 'Running...' : 'Say Hello'}
						</button>
					</div>
				</div>

				<div className="output" data-loading={!greeting}>
					{greeting ?? 'Waiting for request'}
				</div>
			</div>

			<div className="card">
				<h2 className="card-title">How It Works</h2>
				<p className="card-text">
					This page uses <code>useAPI</code> from <code>@agentuity/react</code> to call the Hello
					agent via the <code>/api/hello</code> endpoint. The agent is defined in{' '}
					<code>src/agent/hello/agent.ts</code>.
				</p>
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
						display: flex;
						flex-direction: column;
						gap: 1.5rem;
					}

					.card-title {
						color: #a1a1aa;
						font-size: 1.125rem;
						font-weight: 400;
						margin: 0;
					}

					.highlight {
						color: #fff;
					}

					.input-group {
						display: flex;
						gap: 1rem;
					}

					.input {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						color: #fff;
						flex: 1;
						outline: none;
						padding: 0.75rem 1rem;
						z-index: 2;
					}

					.glow-btn {
						position: relative;
						z-index: 1;
					}

					.glow-bg {
						background: linear-gradient(to right, #155e75, #3b82f6, #9333ea);
						border-radius: 0.5rem;
						inset: 0;
						position: absolute;
						filter: blur(1.25rem);
						opacity: 0.75;
						transition: all 700ms;
					}

					.glow-btn:hover .glow-bg {
						filter: blur(2rem);
						opacity: 1;
					}

					.glow-effect {
						background: #0891b280;
						border-radius: 0.5rem;
						filter: blur(2.5rem);
						inset: 0;
						opacity: 0.5;
						position: absolute;
					}

					.button {
						background-color: #030712;
						border: none;
						border-radius: 0.5rem;
						color: #fff;
						cursor: pointer;
						height: 100%;
						padding: 0 1.5rem;
						position: relative;
						transition: opacity 0.2s;
						white-space: nowrap;
					}

					.button.disabled {
						cursor: not-allowed;
						opacity: 0.5;
					}

					.output {
						background: #09090b;
						border: 1px solid #2b2b30;
						border-radius: 0.375rem;
						color: #22d3ee;
						font-family: monospace;
						line-height: 1.5;
						padding: 0.75rem 1rem;
					}

					.output[data-loading="true"] {
						color: #a1a1aa;
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
				`}
			</style>
		</div>
	);
}
