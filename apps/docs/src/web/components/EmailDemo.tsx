import { type ChangeEvent, useCallback, useRef, useState } from 'react';
import { EMAIL_FROM, EMAIL_TO, generateEmailContent } from '../../lib/email-templates';
import { usePersistentDemoState } from '../hooks/usePersistentDemoState';
import { Badge, Button, Input, Separator } from './ui';

interface EmailResult {
	id: string;
	status: string;
	subject: string;
	to: string[];
	from: string;
	html: string;
}

type Tab = 'preview' | 'setup';

const SESSION_EMAIL_CAP = 5;
const SEND_COOLDOWN_MS = 12_000;

export function EmailDemo() {
	const [tab, setTab] = usePersistentDemoState<Tab>('email', 'tab', {
		defaultValue: 'setup',
		storage: 'session',
	});
	const [userEmail, setUserEmail] = usePersistentDemoState<string>('email', 'userEmail', {
		defaultValue: '',
		storage: 'session',
	});
	const [useCustomEmail, setUseCustomEmail] = useState(false);
	const [hasSent, setHasSent] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [result, setResult] = useState<EmailResult | null>(null);
	const [sendCount, setSendCount] = useState(0);
	const [cooldown, setCooldown] = useState(false);
	const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const limitReached = sendCount >= SESSION_EMAIL_CAP;

	const invoke = useCallback(async (to?: string) => {
		setIsLoading(true);
		setError(null);
		try {
			const body: Record<string, string> = { template: 'welcome' };
			if (to) {
				body.to = to;
			}
			const res = await fetch('/api/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				// Read the error body for a more descriptive message
				const errorBody = await res.json().catch(() => null);
				const message = errorBody?.error || `Request failed: ${res.status} ${res.statusText}`;
				throw new Error(message);
			}
			setResult(await res.json());
			setSendCount((prev) => prev + 1);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Unknown error'));
		} finally {
			setIsLoading(false);
		}
	}, []);

	const handleSend = () => {
		if (limitReached || cooldown || isLoading) return;

		setHasSent(true);
		setTab('preview');

		const to = useCustomEmail && userEmail.trim() ? userEmail.trim() : undefined;
		invoke(to);

		// Start cooldown
		setCooldown(true);
		if (cooldownTimerRef.current) {
			clearTimeout(cooldownTimerRef.current);
		}
		cooldownTimerRef.current = setTimeout(() => {
			setCooldown(false);
			cooldownTimerRef.current = null;
		}, SEND_COOLDOWN_MS);
	};

	const preview = generateEmailContent();
	const showResult = hasSent;
	const displayTo = useCustomEmail && userEmail.trim() ? userEmail.trim() : EMAIL_TO[0];

	const setupCode = `await ctx.email.send({
  from: "${EMAIL_FROM}",
  to: ["${displayTo}"],
  subject: "Hello from the SDK Explorer",
  html: "<p>This email was sent by an agent...</p>",
  text: "This email was sent by an Agentuity agent...",
});`;

	// Determine if send button should be disabled
	const sendDisabled = isLoading || cooldown || limitReached;

	// Send button label
	let sendLabel = 'Send Email';
	if (cooldown) sendLabel = 'Please wait...';
	if (limitReached) sendLabel = 'Limit reached';

	return (
		<div className="flex flex-col gap-4">
			{/* Compose card */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden">
				{/* Header fields */}
				<div className="p-4 space-y-2">
					<div className="flex items-center gap-3 text-xs">
						<span className="text-zinc-500 dark:text-zinc-400 w-14 shrink-0">From</span>
						<span className="text-zinc-700 dark:text-zinc-300 font-mono truncate">
							{EMAIL_FROM}
						</span>
					</div>
					<Separator />
					<div className="flex items-center gap-3 text-xs">
						<span className="text-zinc-500 dark:text-zinc-400 w-14 shrink-0">To</span>
						<div className="flex-1 grid min-w-0">
							{/* Custom email input -- always rendered to reserve height */}
							<div
								className={`col-start-1 row-start-1 flex items-center gap-2 ${useCustomEmail ? '' : 'invisible'}`}
							>
								<Input
									type="email"
									value={userEmail}
									onChange={(e: ChangeEvent<HTMLInputElement>) =>
										setUserEmail(e.currentTarget.value)
									}
									placeholder="you@example.com"
									className="h-7 text-xs font-mono flex-1"
									disabled={isLoading}
									tabIndex={useCustomEmail ? 0 : -1}
								/>
								<button
									type="button"
									onClick={() => setUseCustomEmail(false)}
									className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xs shrink-0 cursor-pointer"
									tabIndex={useCustomEmail ? 0 : -1}
								>
									Reset
								</button>
							</div>
							{/* Default address -- always rendered to reserve height */}
							<div
								className={`col-start-1 row-start-1 flex items-center justify-between ${useCustomEmail ? 'invisible' : ''}`}
							>
								<span className="text-zinc-700 dark:text-zinc-300 font-mono truncate">
									{EMAIL_TO[0]}
								</span>
								<button
									type="button"
									onClick={() => setUseCustomEmail(true)}
									className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 text-xs shrink-0 ml-3 cursor-pointer"
									tabIndex={useCustomEmail ? -1 : 0}
								>
									Use your email
								</button>
							</div>
						</div>
					</div>
					<Separator />
					<div className="flex items-center gap-3 text-xs">
						<span className="text-zinc-500 dark:text-zinc-400 w-14 shrink-0">Subject</span>
						<span className="text-zinc-700 dark:text-zinc-300">{preview.subject}</span>
					</div>
				</div>

				<Separator />

				{/* Action bar */}
				<div className="px-4 py-3 flex items-center gap-3">
					<Button
						onClick={handleSend}
						disabled={sendDisabled}
						variant="outline"
						size="default"
					>
						<span className="relative">
							<span className={isLoading ? 'invisible' : ''}>{sendLabel}</span>
							{isLoading && (
								<span
									className="absolute inset-0 flex items-center justify-center"
									data-loading="true"
								/>
							)}
						</span>
					</Button>
					{sendCount > 0 && (
						<span className="text-zinc-500 dark:text-zinc-600 text-xs">
							{sendCount}/{SESSION_EMAIL_CAP} sent this session
						</span>
					)}
					{limitReached && (
						<span className="text-amber-600 dark:text-amber-400 text-xs">
							Session limit reached. Reload to reset.
						</span>
					)}

					{/* Result status inline */}
					{showResult && result && !isLoading && (
						<div className="flex items-center gap-3 ml-auto">
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
							<span className="text-zinc-500 font-mono text-[10px] truncate max-w-[200px]">
								{result.id}
							</span>
						</div>
					)}
				</div>

				{/* Error state */}
				{showResult && error && !isLoading && (
					<>
						<Separator />
						<div className="px-4 py-3">
							<p className="text-red-600 dark:text-red-400 text-sm">{error.message}</p>
							<p className="text-zinc-500 text-xs mt-1">
								Email sending requires deployment to Agentuity Cloud.
							</p>
						</div>
					</>
				)}
			</div>

			{/* Setup / Preview tabs */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden flex flex-col">
				{/* Tab bar */}
				<div className="px-4 py-3 flex items-center gap-4 shrink-0">
					<button
						type="button"
						onClick={() => setTab('setup')}
						className={`text-sm font-medium pb-1 transition-colors border-b-2 cursor-pointer ${
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
						className={`text-sm font-medium pb-1 transition-colors border-b-2 cursor-pointer ${
							tab === 'preview'
								? 'text-zinc-900 dark:text-white border-cyan-500'
								: 'text-zinc-400 dark:text-zinc-600 border-transparent hover:text-zinc-600 dark:hover:text-zinc-400'
						}`}
					>
						Preview
					</button>
				</div>
				<Separator />

				{/* Both tabs rendered, inactive is invisible -- prevents height jumps */}
				<div className="grid flex-1 min-w-0">
					{/* Setup tab -- ctx.email.send() code */}
					<div
						className={`col-start-1 row-start-1 p-4 min-w-0 ${tab === 'setup' ? '' : 'invisible'}`}
					>
						<pre className="rounded-md bg-zinc-950 border border-zinc-800 p-4 text-[12px] leading-relaxed font-mono text-zinc-300 whitespace-pre overflow-x-auto">
							<code>{setupCode}</code>
						</pre>
					</div>

					{/* Preview tab -- rendered email */}
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
								className="p-4 max-h-[350px] overflow-y-auto text-sm [&_p]:text-sm [&_p]:leading-relaxed"
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
