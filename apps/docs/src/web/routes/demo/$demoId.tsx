import { createFileRoute, notFound } from '@tanstack/react-router';
import { BookOpenIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect } from 'react';
import { CodeBlock } from '../../components/CodeBlock';
import { TerminalOutput } from '../../components/TerminalOutput';
import { Separator } from '../../components/ui';
import { useSandboxRunner } from '../../hooks/useSandboxRunner';
import { TEST_OUTPUTS } from '../../test-outputs';
import { getDemoById, type DemoConfig } from '../../demo-config';

export const Route = createFileRoute('/demo/$demoId')({
	component: DemoView,
	loader: ({ params }) => {
		const demo = getDemoById(params.demoId);
		if (!demo) {
			throw notFound();
		}
		return { demo };
	},
	staticData: { crumb: 'Demo' },
});

const TEST_MODE = false;

function DemoView() {
	const { demo } = Route.useLoaderData();
	const DemoComponent = demo.component;
	const sandbox = useSandboxRunner();

	const testOutput =
		TEST_MODE && demo.sandboxScript ? (TEST_OUTPUTS[demo.sandboxScript] ?? null) : null;

	const handleRun = useCallback(() => {
		if (!TEST_MODE && demo.sandboxScript) {
			sandbox.run(demo.sandboxScript, demo.sandboxInput);
		}
	}, [demo.sandboxScript, demo.sandboxInput, sandbox.run]);

	useEffect(() => {
		return () => {
			sandbox.reset();
		};
	}, [sandbox.reset]);

	const isRunning = sandbox.state.status === 'creating' || sandbox.state.status === 'running';
	const output = testOutput ?? sandbox.state.output;
	const status = testOutput ? 'completed' : sandbox.state.status;

	return (
		<div className="flex flex-col lg:grid lg:grid-cols-[55fr_45fr] min-h-0 flex-1">
			{/* Left: Interactive demo */}
			<div className="flex-1 lg:h-full overflow-auto lg:border-r border-b lg:border-b-0 border-zinc-200 dark:border-zinc-800 p-4 min-w-0">
				{/* Explanation block */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden mb-4 min-h-[140px]">
					<div className="flex items-center justify-between px-4 h-12 bg-zinc-100/50 dark:bg-zinc-900/50">
						<h2 className="text-lg font-normal text-cyan-600 dark:text-cyan-400">
							{demo.title}
						</h2>
						{demo.docsUrl && (
							<a
								href={demo.docsUrl}
								className="flex items-center gap-1.5 text-zinc-500 hover:text-cyan-500 transition-colors cursor-pointer"
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
			<div className="flex-1 lg:h-full overflow-auto p-4 min-w-0 flex flex-col gap-4">
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
							output={output}
							status={status}
							error={sandbox.state.error}
							exitCode={testOutput ? 0 : sandbox.state.exitCode}
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
