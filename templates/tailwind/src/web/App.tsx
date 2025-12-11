import { useAPI } from '@agentuity/react';
import { type ChangeEvent, useState } from 'react';

const WORKBENCH_PATH = process.env.AGENTUITY_PUBLIC_WORKBENCH_PATH;

export function App() {
	const [name, setName] = useState('World');
	const { data: greeting, invoke, isLoading: running } = useAPI('POST /api/hello');

	return (
		<div className="min-h-screen bg-zinc-950 text-white flex justify-center font-sans">
			<div className="flex flex-col gap-8 max-w-3xl w-full p-16">
				<div className="flex flex-col items-center justify-center gap-2 mb-8 relative text-center">
					<svg
						aria-hidden="true"
						aria-label="Agentuity Logo"
						className="w-12 h-auto mb-4"
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

					<h1 className="text-5xl font-thin m-0">Welcome to Agentuity</h1>

					<p className="text-zinc-400 text-lg m-0">
						The <span className="italic font-serif font-thin">Full-Stack</span> Platform for
						AI Agents
					</p>
				</div>

				<div className="bg-black border border-zinc-900 rounded-lg p-8 shadow-2xl flex flex-col gap-8 overflow-hidden">
					<h2 className="text-zinc-400 text-xl font-normal leading-tight m-0">
						Try the <span className="text-white">Hello Agent</span>
					</h2>

					<div className="flex gap-4">
						<input
							className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md text-white outline-none px-4 py-3 z-10"
							disabled={running}
							onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.currentTarget.value)}
							placeholder="Enter your name"
							type="text"
							value={name}
						/>

						<div className="relative z-10 group">
							<div className="absolute inset-0 bg-gradient-to-r from-cyan-700 via-blue-500 to-purple-600 rounded-lg blur-xl opacity-75 group-hover:blur-2xl group-hover:opacity-100 transition-all duration-700" />
							<div className="absolute inset-0 bg-cyan-500/50 rounded-lg blur-3xl opacity-50" />
							<button
								className={`relative bg-zinc-950 border-none rounded-lg text-white h-full px-6 transition-opacity whitespace-nowrap ${
									running ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
								}`}
								disabled={running}
								onClick={() => invoke({ name })}
								type="button"
							>
								{running ? 'Running...' : 'Say Hello'}
							</button>
						</div>
					</div>

					<div
						className={`flex-1 bg-zinc-950 border border-zinc-800 rounded-md font-mono leading-relaxed px-4 py-3 z-10 ${
							greeting ? 'text-cyan-400' : 'text-zinc-400'
						}`}
					>
						{greeting ?? 'Waiting for request'}
					</div>
				</div>

				<div className="bg-black border border-zinc-900 rounded-lg p-8">
					<h3 className="text-white text-xl font-normal leading-tight m-0 mb-6">Next Steps</h3>

					<div className="flex flex-col gap-6">
						{[
							{
								key: 'customize-agent',
								title: 'Customize your agent',
								text: (
									<>
										Edit <code className="text-white">src/agent/hello/agent.ts</code> to
										change how your agent responds.
									</>
								),
							},
							{
								key: 'add-routes',
								title: 'Add new API routes',
								text: (
									<>
										Create new files in <code className="text-white">src/web/</code> to
										expose more endpoints.
									</>
								),
							},
							{
								key: 'update-frontend',
								title: 'Update the frontend',
								text: (
									<>
										Modify <code className="text-white">src/web/App.tsx</code> to build
										your custom UI with Tailwind CSS.
									</>
								),
							},
							WORKBENCH_PATH
								? {
										key: 'try-workbench',
										title: (
											<>
												Try{' '}
												<a
													href={WORKBENCH_PATH}
													className="bg-gradient-to-r from-cyan-700 via-blue-500 to-purple-600 bg-[length:300%_100%] bg-clip-text text-transparent no-underline animate-gradient-shift relative hover:after:opacity-100 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-gradient-to-r after:from-cyan-700 after:via-blue-500 after:to-purple-600 after:bg-[length:300%_100%] after:animate-gradient-shift after:opacity-0 after:transition-opacity after:duration-300"
												>
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
								<div key={step!.key} className="flex items-start gap-3">
									<div className="flex items-center justify-center w-4 h-4 bg-emerald-950 border border-emerald-500 rounded">
										<svg
											aria-hidden="true"
											className="w-2.5 h-2.5"
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
										<h4 className="text-white text-sm font-normal m-0 mb-1">
											{step!.title}
										</h4>
										<p className="text-zinc-400 text-xs m-0">{step!.text}</p>
									</div>
								</div>
							))}
					</div>
				</div>
			</div>
		</div>
	);
}
