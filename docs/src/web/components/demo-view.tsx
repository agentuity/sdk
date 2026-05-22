import { BookOpenIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect } from 'react';
import { CodeBlock } from './CodeBlock';
import { TerminalOutput } from './TerminalOutput';
import { Separator } from './ui';
import { useSandboxRunner } from '../hooks/useSandboxRunner';
import { getDemoById } from '../demo-config';

export function DemoView({ demoId }: { demoId: string }) {
	const demo = getDemoById(demoId);
	const sandbox = useSandboxRunner();

	const handleRun = useCallback(() => {
		if (demo?.sandboxScript) {
			sandbox.run(demo.sandboxScript, demo.sandboxInput);
		}
	}, [demo?.sandboxScript, demo?.sandboxInput, sandbox.run]);

	useEffect(() => {
		return () => {
			sandbox.reset();
		};
	}, [sandbox.reset]);

	if (!demo) {
		return (
			<div className="flex items-center justify-center h-full text-zinc-500">
				Demo not found: {demoId}
			</div>
		);
	}

	const DemoComponent = demo.component;
	const isRunning = sandbox.state.status === 'creating' || sandbox.state.status === 'running';

	return (
		<div className="flex flex-col lg:grid lg:grid-cols-[55fr_45fr] gap-4 min-h-0 flex-1 p-4">
			{/* Left: Interactive demo */}
			<div className="flex-1 lg:h-full overflow-auto min-w-0">
				{/* Explanation block */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden mb-4 min-h-[140px]">
					<div className="flex items-center justify-between px-4 h-12 bg-zinc-100/50 dark:bg-zinc-900/50">
						<h2 className="text-lg font-normal text-cyan-700 dark:text-cyan-400">
							{demo.title}
						</h2>
						{demo.docsUrl && (
							<a
								href={demo.docsUrl}
								className="flex items-center gap-1.5 text-zinc-500 hover:text-cyan-700 dark:hover:text-cyan-500 transition-colors cursor-pointer"
							>
								<BookOpenIcon className="w-5 h-5" />
								<span className="text-sm">Docs</span>
							</a>
						)}
					</div>
					<Separator />
					<div className="px-4 py-4">
						<p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">
							{demo.explanation}
						</p>
					</div>
				</div>

				<DemoComponent />
			</div>

			{/* Right: Code example */}
			<div className="flex-1 lg:h-full overflow-auto min-w-0 flex flex-col gap-4">
				{demo.sandboxEnabled ? (
					<>
						<CodeBlock
							code={demo.codeExample}
							title="Reference Code"
							showRunButton
							onRun={handleRun}
							isRunning={isRunning}
							highlights={demo.codeHighlights}
						/>
						<TerminalOutput
							output={sandbox.state.output}
							status={sandbox.state.status}
							error={sandbox.state.error}
							exitCode={sandbox.state.exitCode}
							onClear={sandbox.reset}
							isRoute={demo.isRoute}
						/>
					</>
				) : (
					<CodeBlock
						code={demo.codeExample}
						title="Reference Code"
						highlights={demo.codeHighlights}
					/>
				)}
			</div>
		</div>
	);
}
