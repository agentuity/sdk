import { useAPI } from '@agentuity/react';
import { type ChangeEvent, useState } from 'react';

const WORKBENCH_PATH = process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH;

export function App() {
	const [name, setName] = useState('World');
	const { data: greeting, invoke, isLoading: running } = useAPI('POST /api/hello');

	return (
		<div className="app-container">
			<div className="content-wrapper">
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
				</div>

				<div className="card card-interactive">
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
					<h3 className="section-title">Next Steps</h3>

					<div className="steps-list">
						{[
							{
								key: 'customize-agent',
								title: 'Customize your agent',
								text: (
									<>
										Edit <code>src/agent/hello/agent.ts</code> to change how your agent
										responds.
									</>
								),
							},
							{
								key: 'add-routes',
								title: 'Add new API routes',
								text: (
									<>
										Create new files in <code>src/web/</code> to expose more endpoints.
									</>
								),
							},
							{
								key: 'update-frontend',
								title: 'Update the frontend',
								text: (
									<>
										Modify <code>src/web/App.tsx</code> to build your custom UI.
									</>
								),
							},
							WORKBENCH_PATH
								? {
										key: 'try-workbench',
										title: (
											<>
												Try{' '}
												<a href={WORKBENCH_PATH} className="workbench-link">
													Workbench
												</a>
											</>
										),
										text: <>A chat interface to test your agents in isolation.</>,
									}
								: null,
						]
							.filter(Boolean)
							.map((step) => (
								<div key={step!.key} className="step">
									<div className="step-icon">
										<svg
											aria-hidden="true"
											className="checkmark"
											fill="none"
											height="24"
											stroke="#00c951"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											viewBox="0 0 24 24"
											width="24"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path d="M20 6 9 17l-5-5"></path>
										</svg>
									</div>

									<div>
										<h4 className="step-title">{step!.title}</h4>
										<p className="step-text">{step!.text}</p>
									</div>
								</div>
							))}
					</div>
				</div>
			</div>

			<style>
				{`
					body {
						background-color: #09090b;
					}

					.app-container {
						background-color: #09090b;
						color: #fff;
						display: flex;
						font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
						justify-content: center;
						min-height: 100vh;
					}

					.content-wrapper {
						display: flex;
						flex-direction: column;
						gap: 2rem;
						max-width: 48rem;
						padding: 4rem;
						width: 100%;
					}

					.header {
						align-items: center;
						display: flex;
						flex-direction: column;
						gap: 0.5rem;
						justify-content: center;
						margin-bottom: 2rem;
						position: relative;
						text-align: center;
					}

					.workbench-link {
						background: linear-gradient(90deg, #155e75, #3b82f6, #9333ea, #155e75);
						background-size: 300% 100%;
						background-clip: text;
						-webkit-background-clip: text;
						-webkit-text-fill-color: transparent;
						color: transparent;
						text-decoration: none;
						animation: gradientShift 2s ease-in-out infinite alternate;
						position: relative;
					}

					.workbench-link::after {
						content: '';
						position: absolute;
						bottom: 0;
						left: 0;
						width: 100%;
						height: 1px;
						background: linear-gradient(90deg, #155e75, #3b82f6, #9333ea, #155e75);
						background-size: 300% 100%;
						animation: gradientShift 2s ease-in-out infinite alternate;
						opacity: 0;
						transition: opacity 0.3s ease;
					}

					.workbench-link:hover::after {
						opacity: 1;
					}

					@keyframes gradientShift {
						0% {
							background-position: 0% 50%;
						}
						100% {
							background-position: 100% 50%;
						}
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
						margin: 0;
					}

					.italic {
						font-family: Georgia, "Times New Roman", Times, serif;
						font-style: italic;
						font-weight: 100;
					}

					.card {
						background: #000;
						border: 1px solid #18181b;
						border-radius: 0.5rem;
						padding: 2rem;
					}

					.card-interactive {
						box-shadow: 0 1.5rem 3rem -0.75rem #00000040;
						display: flex;
						flex-direction: column;
						gap: 2rem;
						overflow: hidden;
					}

					.card-title {
						color: #a1a1aa;
						font-size: 1.25rem;
						font-weight: 400;
						line-height: 1;
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
						flex: 1;
						font-family: monospace;
						line-height: 1.5;
						padding: 0.75rem 1rem;
						z-index: 2;
					}

					.output[data-loading="true"] {
						color: #a1a1aa;
					}

					.section-title {
						color: #fff;
						font-size: 1.25rem;
						font-weight: 400;
						line-height: 1;
						margin: 0 0 1.5rem 0;
					}

					.steps-list {
						display: flex;
						flex-direction: column;
						gap: 1.5rem;
					}

					.step {
						align-items: flex-start;
						display: flex;
						gap: 0.75rem;
					}

					.step-icon {
						align-items: center;
						background-color: #002810;
						border: 1px solid #00c951;
						border-radius: 0.25rem;
						display: flex;
						height: 1rem;
						justify-content: center;
						width: 1rem;
					}

					.checkmark {
						height: 0.65rem;
						width: 0.65rem;
					}

					.step-title {
						color: #fff;
						font-size: 0.875rem;
						font-weight: 400;
						margin: 0 0 0.25rem 0;
					}

					.step-text {
						color: #a1a1aa;
						font-size: 0.75rem;
						margin: 0;
					}

					.step-text code {
						color: #fff;
					}

					@keyframes ellipsis {
						0% { content: ""; }
						25% { content: "."; }
						50% { content: ".."; }
						75% { content: "..."; }
						100% { content: ""; }
					}

					[data-loading="true"]::after {
						animation: ellipsis 1.2s steps(1, end) infinite;
						content: ".";
						display: inline-block;
						width: 1em;
					}
				`}
			</style>
		</div>
	);
}
