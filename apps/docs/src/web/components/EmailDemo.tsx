import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { EMAIL_FROM, generateEmailContent, isValidEmail } from '../../lib/email-templates';
import { usePersistentDemoState } from '../hooks/usePersistentDemoState';
import { Badge, Button, Input, Separator } from './ui';

type EmailDeliveryState = 'queued' | 'delivered' | 'failed';

interface EmailResult {
	id: string;
	status: string;
	subject: string;
	to: string[];
	from: string;
	html: string;
	deliveryState: EmailDeliveryState;
	deliveryError: string | null;
}

type Tab = 'preview' | 'setup';

const SESSION_EMAIL_CAP = 5;
const SEND_COOLDOWN_MS = 12_000;

function getDeliveryBadgeVariant(state: EmailDeliveryState) {
	switch (state) {
		case 'delivered':
			return 'success' as const;
		case 'failed':
			return 'destructive' as const;
		default:
			return 'secondary' as const;
	}
}

function getDeliveryLabel(state: EmailDeliveryState) {
	switch (state) {
		case 'delivered':
			return 'delivered';
		case 'failed':
			return 'delivery failed';
		default:
			return 'queued';
	}
}

function getDeliveryDetail(result: EmailResult) {
	if (result.deliveryState === 'failed') {
		return result.deliveryError ?? 'The email service could not deliver this message.';
	}

	const recipient = result.to[0] ?? 'your inbox';

	if (result.deliveryState === 'delivered') {
		return `Accepted for delivery to ${recipient}`;
	}

	return `Queued for delivery to ${recipient}`;
}

export function EmailDemo() {
	const [tab, setTab] = usePersistentDemoState<Tab>('email', 'tab', {
		defaultValue: 'setup',
		storage: 'session',
	});
	const [userEmail, setUserEmail] = usePersistentDemoState<string>('email', 'userEmail', {
		defaultValue: '',
		storage: 'session',
	});
	const [hasSent, setHasSent] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [showCloudHint, setShowCloudHint] = useState(false);
	const [result, setResult] = useState<EmailResult | null>(null);
	const [sendCount, setSendCount] = useState(0);
	const [cooldown, setCooldown] = useState(false);
	const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const limitReached = sendCount >= SESSION_EMAIL_CAP;
	const trimmedEmail = userEmail.trim();
	const hasRecipient = trimmedEmail.length > 0;
	const hasValidEmail = isValidEmail(trimmedEmail);
	const displayTo = trimmedEmail || 'you@example.com';

	useEffect(() => {
		return () => {
			if (cooldownTimerRef.current) {
				clearTimeout(cooldownTimerRef.current);
			}
		};
	}, []);

	const invoke = useCallback(async (to: string) => {
		setIsLoading(true);
		setError(null);
		setResult(null);
		setShowCloudHint(false);
		try {
			const res = await fetch('/api/email', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					template: 'welcome',
					to,
				}),
			});
			if (!res.ok) {
				// Read the error body for a more descriptive message
				const errorBody = await res.json().catch(() => null);
				const message = errorBody?.error || `Request failed: ${res.status} ${res.statusText}`;
				setShowCloudHint(res.status >= 500);
				throw new Error(message);
			}
			setResult(await res.json());
			setSendCount((prev) => prev + 1);
		} catch (err) {
			const nextError = err instanceof Error ? err : new Error('Unknown error');
			setError(nextError);
			if (!nextError.message.toLowerCase().includes('valid email address')) {
				setShowCloudHint(true);
			}
		} finally {
			setIsLoading(false);
		}
	}, []);

	const handleSend = () => {
		if (limitReached || cooldown || isLoading || !hasValidEmail) return;

		setHasSent(true);
		setTab('preview');
		invoke(trimmedEmail);

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
	const renderedEmailHtml = showResult && result ? result.html : preview.html;
	const deliveryLabel = result ? getDeliveryLabel(result.deliveryState) : null;
	const deliveryDetail = result ? getDeliveryDetail(result) : null;

	const setupCode = `await ctx.email.send({
  from: "${EMAIL_FROM}",
  to: ["${displayTo}"],
  subject: "${preview.subject}",
  html: "<p>This email was sent by an agent...</p>",
  text: "This email was sent by an Agentuity agent...",
});`;

	// Determine if send button should be disabled
	const sendDisabled = isLoading || cooldown || limitReached || !hasValidEmail;

	// Send button label
	let sendLabel = 'Send Email';
	if (cooldown) sendLabel = 'Please wait...';
	if (limitReached) sendLabel = 'Limit reached';
	if (!hasRecipient) sendLabel = 'Enter email';
	if (hasRecipient && !hasValidEmail) sendLabel = 'Use valid email';

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
						<div className="flex-1 min-w-0 space-y-1.5">
							<Input
								type="email"
								value={userEmail}
								onChange={(e: ChangeEvent<HTMLInputElement>) =>
									setUserEmail(e.currentTarget.value)
								}
								placeholder="you@example.com"
								className="h-7 text-xs font-mono"
								disabled={isLoading}
							/>
							<p className="text-[11px] text-zinc-500 dark:text-zinc-400">
								Send this demo to an inbox you can check. The Preview tab matches the
								delivered HTML.
							</p>
							<p
								className={`text-[11px] ${
									hasRecipient && !hasValidEmail
										? 'text-red-600 dark:text-red-400'
										: 'invisible'
								}`}
							>
								Enter a valid email address.
							</p>
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
					{limitReached && (
						<span className="text-amber-600 dark:text-amber-400 text-xs">
							Session limit reached. Reload to reset.
						</span>
					)}

					{/* Result status inline */}
					{showResult && result && !isLoading && (
						<div className="flex items-center gap-3 ml-auto min-w-0">
							<Badge
								variant={getDeliveryBadgeVariant(result.deliveryState)}
								className="text-[10px] shrink-0"
							>
								{deliveryLabel}
							</Badge>
							<p className="text-zinc-500 text-[10px] truncate">{deliveryDetail}</p>
						</div>
					)}
				</div>

				{/* Error state */}
				{showResult && error && !isLoading && (
					<>
						<Separator />
						<div className="px-4 py-3">
							<p className="text-red-600 dark:text-red-400 text-sm">{error.message}</p>
							{showCloudHint && (
								<p className="text-zinc-500 text-xs mt-1">
									Email sending requires deployment to Agentuity Cloud.
								</p>
							)}
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
							<div className="p-4 max-h-[350px] overflow-y-auto space-y-4">
								{showResult && result && (
									<div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 p-3">
										<div className="flex flex-wrap items-center gap-2">
											<Badge
												variant={getDeliveryBadgeVariant(result.deliveryState)}
												className="text-[10px]"
											>
												{deliveryLabel}
											</Badge>
											<span className="text-xs text-zinc-500 dark:text-zinc-400">
												{deliveryDetail}
											</span>
										</div>
									</div>
								)}
								<div
									className="text-sm [&_p]:text-sm [&_p]:leading-relaxed"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generated by our templates, not user input
									dangerouslySetInnerHTML={{
										__html: renderedEmailHtml,
									}}
								/>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
