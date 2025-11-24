import { AgentuityProvider, useAgent } from "@agentuity/react";
import { type ChangeEvent, useState } from "react";

export function App() {
	const [name, setName] = useState("World");
	const { run, running, data: greeting } = useAgent("hello");

	return (
		<div
			style={{
				backgroundColor: "#09090b",
				color: "#fff",
				display: "flex",
				fontFamily:
					'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
				justifyContent: "center",
				minHeight: "100vh",
			}}
		>
			<AgentuityProvider>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "2rem",
						maxWidth: "48rem",
						padding: "4rem",
						width: "100%",
					}}
				>
					<div
						style={{
							alignItems: "center",
							display: "flex",
							flexDirection: "column",
							gap: "0.5rem",
							justifyContent: "center",
							marginBottom: "2rem",
							textAlign: "center",
						}}
					>
						<svg
							aria-hidden="true"
							aria-label="Agentuity Logo"
							fill="none"
							height="191"
							style={{
								height: "auto",
								marginBottom: "1rem",
								width: "3rem",
							}}
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

						<h1
							style={{
								fontSize: "3rem",
								fontWeight: 100,
								margin: 0,
							}}
						>
							Welcome to Agentuity
						</h1>

						<p
							style={{
								color: "#a1a1aa",
								fontSize: "1.15rem",
								margin: 0,
							}}
						>
							The{" "}
							<span
								style={{
									fontFamily: 'Georgia, "Times New Roman", Times, serif',
									fontStyle: "italic",
									fontWeight: 100,
								}}
							>
								Full-Stack
							</span>{" "}
							Platform for AI Agents
						</p>
					</div>

					<div
						style={{
							background: "#000",
							border: "1px solid #18181B",
							borderRadius: "0.5rem",
							boxShadow: "0 1.5rem 3rem -0.75rem #00000040",
							display: "flex",
							flexDirection: "column",
							gap: "2rem",
							overflow: "hidden",
							padding: "2rem",
						}}
					>
						<h2
							style={{
								color: "#a1a1aa",
								fontSize: "1.25rem",
								fontWeight: 400,
								lineHeight: 1,
								margin: 0,
							}}
						>
							Try the <span style={{ color: "#fff" }}>Hello Agent</span>
						</h2>

						<div
							style={{
								display: "flex",
								gap: "1rem",
							}}
						>
							<input
								disabled={running}
								onChange={(e: ChangeEvent<HTMLInputElement>) =>
									setName(e.currentTarget.value)
								}
								placeholder="Enter your name"
								type="text"
								value={name}
								style={{
									background: "#09090b",
									border: "1px solid #2b2b30",
									borderRadius: "0.375rem",
									color: "#fff",
									flex: 1,
									outline: "none",
									padding: "0.75rem 1rem",
									zIndex: 2,
								}}
							/>

							<div
								className="glow-btn"
								style={{
									position: "relative",
									zIndex: 1,
								}}
							>
								<div
									className="glow-bg"
									style={{
										background:
											"linear-gradient(to right, #155e75, #3b82f6, #9333ea)",
										borderRadius: "0.5rem",
										inset: 0,
										position: "absolute",
									}}
								/>

								<div
									style={{
										background: "#0891b280",
										borderRadius: "0.5rem",
										filter: "blur(2.5rem)",
										inset: 0,
										opacity: 0.5,
										position: "absolute",
									}}
								/>

								<button
									disabled={running}
									onClick={() => run({ name })}
									style={{
										backgroundColor: "#030712",
										border: "none",
										borderRadius: "0.5rem",
										color: "#fff",
										cursor: running ? "not-allowed" : "pointer",
										height: "100%",
										opacity: running ? 0.5 : 1,
										padding: "0 1.5rem",
										position: "relative",
										transition: "opacity 0.2s",
										whiteSpace: "nowrap",
									}}
									type="button"
								>
									{running ? "Running..." : "Say Hello"}
								</button>
							</div>
						</div>

						<div
							data-loading={!greeting}
							style={{
								background: "#09090b",
								border: "1px solid #2b2b30",
								borderRadius: "0.375rem",
								color: greeting ? "#22d3ee" : "#a1a1aa",
								flex: 1,
								fontFamily: "monospace",
								lineHeight: "1.5",
								padding: "0.75rem 1rem",
								zIndex: 2,
							}}
						>
							{greeting ?? "Waiting for request"}
						</div>
					</div>

					<div
						style={{
							background: "#000",
							border: "1px solid #18181b",
							borderRadius: "0.5rem",
							padding: "2rem",
						}}
					>
						<h3
							style={{
								color: "#fff",
								fontSize: "1.25rem",
								fontWeight: 400,
								lineHeight: 1,
								margin: "0 0 1.5rem 0",
							}}
						>
							Next Steps
						</h3>

						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "1.5rem",
							}}
						>
							{[
								{
									title: "Customize your agent",
									text: (
										<>
											Edit{" "}
											<code style={{ color: "#fff" }}>
												src/agents/hello/agent.ts
											</code>{" "}
											to change how your agent responds.
										</>
									),
								},
								{
									title: "Add new API routes",
									text: (
										<>
											Create new files in{" "}
											<code style={{ color: "#fff" }}>src/apis/</code> to expose
											more endpoints.
										</>
									),
								},
								{
									title: "Update the frontend",
									text: (
										<>
											Modify{" "}
											<code style={{ color: "#fff" }}>src/web/App.tsx</code> to
											build your custom UI.
										</>
									),
								},
							].map((step) => (
								<div
									key={step.title}
									style={{
										alignItems: "flex-start",
										display: "flex",
										gap: "0.75rem",
									}}
								>
									<div
										style={{
											alignItems: "center",
											backgroundColor: "#002810",
											border: "1px solid #00c951",
											borderRadius: "0.25rem",
											display: "flex",
											height: "1rem",
											justifyContent: "center",
											width: "1rem",
										}}
									>
										<svg
											aria-hidden="true"
											fill="none"
											height="24"
											stroke="#00c951"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											style={{
												height: "0.65rem",
												width: "0.65rem",
											}}
											viewBox="0 0 24 24"
											width="24"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path d="M20 6 9 17l-5-5"></path>
										</svg>
									</div>

									<div>
										<h4
											style={{
												color: "#fff",
												fontSize: "0.875rem",
												fontWeight: 400,
												margin: "0 0 0.25rem 0",
											}}
										>
											{step.title}
										</h4>

										<p
											style={{
												color: "#a1a1aa",
												fontSize: "0.75rem",
												margin: 0,
											}}
										>
											{step.text}
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</AgentuityProvider>

			<style>
				{`
					.glow-btn .glow-bg {
						filter: blur(1.25rem);
						opacity: 0.75;
						transition: all 700ms;
					}
					.glow-btn:hover .glow-bg {
						filter: blur(2rem);
						opacity: 1;
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
