import { useCallback, useState } from 'react';
import { EMAIL_FROM, EMAIL_NAME, EMAIL_TO, generateEmailContent } from '../../lib/email-templates';
import { Badge, Button, Separator } from './ui';

interface EmailResult {
	id: string;
	status: string;
	subject: string;
	to: string[];
	from: string;
	html: string;
}

type Tab = 'preview' | 'setup';

export function EmailDemo() {
	const [hasSent, setHasSent] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [result, setResult] = useState<EmailResult | null>(null);
	const [tab, setTab] = useState<Tab>('setup');

	const invoke = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch('/api/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ template: 'welcome' }),
			});
			if (!res.ok) {
				throw new Error(`Request failed: ${res.status} ${res.statusText}`);
			}
			setResult(await res.json());
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Unknown error'));
		} finally {
			setIsLoading(false);
		}
	}, []);

	const handleSend = () => {
		setHasSent(true);
		setTab('preview');
		invoke();
	};

	const preview = generateEmailContent('welcome', EMAIL_NAME);
	const showResult = hasSent;

	const setupCode = `await ctx.email.send({
  from: "${EMAIL_FROM}",
  to: ["${EMAIL_TO[0]}"],
  subject: "Hello from the SDK Explorer",
  html: "<p>This email was sent by an agent...</p>",
  text: "This email was sent by an Agentuity agent...",
});`;

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{/* Left Panel - Controls */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4 flex flex-col gap-4">
				{/* From / To */}
				<div className="space-y-1.5">
					<div className="flex items-center gap-2 text-xs">
						<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">From</span>
						<span className="text-zinc-700 dark:text-zinc-300 font-mono">{EMAIL_FROM}</span>
					</div>
					<div className="flex items-center gap-2 text-xs">
						<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">To</span>
						<span className="text-zinc-700 dark:text-zinc-300 font-mono">
							{EMAIL_TO.join(', ')}
						</span>
					</div>
				</div>

				{/* Subject preview */}
				<div className="flex items-center gap-2 text-xs">
					<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">Subj</span>
					<span className="text-zinc-700 dark:text-zinc-300">{preview.subject}</span>
				</div>

				{/* Send button */}
				<Button
					onClick={handleSend}
					disabled={isLoading}
					variant="outline"
					size="default"
					className="self-start"
				>
					<span className="relative">
						<span className={isLoading ? 'invisible' : ''}>Send Email</span>
						{isLoading && (
							<span
								className="absolute inset-0 flex items-center justify-center"
								data-loading="true"
							/>
						)}
					</span>
				</Button>

				{/* Result metadata */}
				{showResult && result && !isLoading && (
					<div className="space-y-1.5 pt-2 border-t border-zinc-200 dark:border-zinc-900">
						<div className="flex items-center gap-2 text-xs">
							<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">ID</span>
							<span className="text-zinc-500 font-mono truncate">{result.id}</span>
						</div>
						<div className="flex items-center gap-2 text-xs">
							<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">Status</span>
							<Badge
								variant={
									result.status === 'sent' || result.status === 'pending'
										? 'success'
										: 'secondary'
								}
								className="text-[10px]"
							>
								{result.status}
							</Badge>
						</div>
					</div>
				)}

				{/* Error state */}
				{showResult && error && !isLoading && (
					<div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-900">
						<p className="text-red-600 dark:text-red-400 text-sm">{error.message}</p>
						<p className="text-zinc-500 text-xs">
							Email sending requires deployment to Agentuity Cloud.
						</p>
					</div>
				)}
			</div>

			{/* Right Panel - Tabs: Setup / Preview */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden flex flex-col">
				{/* Tab bar */}
				<div className="px-4 py-3 flex items-center gap-4 shrink-0">
					<button
						type="button"
						onClick={() => setTab('setup')}
						className={`text-sm font-medium pb-1 transition-colors border-b-2 ${
							tab === 'setup'
								? 'text-zinc-900 dark:text-white border-cyan-500'
								: 'text-zinc-400 dark:text-zinc-600 border-transparent hover:text-zinc-600 dark:hover:text-zinc-400'
						}`}
					>
						Setup
					</button>
					<button
						type="button"
						onClick={() => setTab('preview')}
						className={`text-sm font-medium pb-1 transition-colors border-b-2 ${
							tab === 'preview'
								? 'text-zinc-900 dark:text-white border-cyan-500'
								: 'text-zinc-400 dark:text-zinc-600 border-transparent hover:text-zinc-600 dark:hover:text-zinc-400'
						}`}
					>
						Preview
					</button>
				</div>
				<Separator />

				{/* Both tabs rendered, inactive is invisible — prevents height jumps */}
				<div className="grid flex-1">
					{/* Setup tab — ctx.email.send() code */}
					<div className={`col-start-1 row-start-1 p-4 ${tab === 'setup' ? '' : 'invisible'}`}>
						<pre className="rounded-md bg-zinc-950 border border-zinc-800 p-4 text-[12px] leading-relaxed font-mono text-zinc-300 whitespace-pre overflow-x-auto">
							<code>{setupCode}</code>
						</pre>
					</div>

					{/* Preview tab — rendered email */}
					<div
						className={`col-start-1 row-start-1 overflow-hidden ${tab === 'preview' ? '' : 'invisible'}`}
					>
						{/* Loading */}
						{showResult && isLoading && (
							<div className="p-8 flex items-center justify-center">
								<span data-loading="true" className="size-6" />
							</div>
						)}

						{/* Rendered email */}
						{(!showResult || (showResult && result && !isLoading)) && (
							<div
								className="p-4 max-h-[450px] overflow-y-auto"
								// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generated by our templates, not user input
								dangerouslySetInnerHTML={{
									__html: showResult && result ? result.html : preview.html,
								}}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
