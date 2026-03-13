import { useAPI } from '@agentuity/react';
import { BarChart3, Hand, Package } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
	EMAIL_FROM,
	EMAIL_NAME,
	EMAIL_TO,
	generateEmailContent,
	type EmailTemplateId,
} from '../../lib/email-templates';
import { Badge, Button, Separator } from './ui';

const TEMPLATES: { id: EmailTemplateId; label: string; icon: ReactNode }[] = [
	{ id: 'welcome', label: 'Welcome Email', icon: <Hand className="size-3.5" /> },
	{
		id: 'order-confirmation',
		label: 'Order Confirmation',
		icon: <Package className="size-3.5" />,
	},
	{ id: 'weekly-digest', label: 'Weekly Digest', icon: <BarChart3 className="size-3.5" /> },
];

export function EmailDemo() {
	const [template, setTemplate] = useState<EmailTemplateId>('welcome');
	const [hasSent, setHasSent] = useState(false);
	const { invoke, isLoading, data: result, error, reset } = useAPI('POST /api/email');

	const preview = useMemo(() => generateEmailContent(template, EMAIL_NAME), [template]);

	const handleSend = () => {
		setHasSent(true);
		invoke({ template });
	};

	const handleTemplateChange = (id: EmailTemplateId) => {
		setTemplate(id);
		if (hasSent) {
			setHasSent(false);
			reset();
		}
	};

	const showResult = hasSent;

	return (
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Left Panel - Controls */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
					<div className="flex flex-col gap-4">
						{/* Template Selector */}
						<div>
							<span className="text-zinc-500 dark:text-zinc-400 block text-xs mb-2 uppercase">
								Template
							</span>
							<div className="flex flex-wrap gap-2">
								{TEMPLATES.map((t) => (
									<Button
										key={t.id}
										onClick={() => handleTemplateChange(t.id)}
										disabled={isLoading}
										variant={template === t.id ? 'toggle-active' : 'toggle'}
										size="xs"
									>
										{t.icon}
										<span>{t.label}</span>
									</Button>
								))}
							</div>
						</div>

						{/* Email Info */}
						<div className="space-y-1.5">
							<div className="flex items-center gap-2 text-xs">
								<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">From</span>
								<span className="text-zinc-700 dark:text-zinc-300 font-mono">
									{EMAIL_FROM}
								</span>
							</div>
							<div className="flex items-center gap-2 text-xs">
								<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">To</span>
								<span className="text-zinc-700 dark:text-zinc-300 font-mono">
									{EMAIL_TO.join(', ')}
								</span>
							</div>
						</div>

						{/* Send Button */}
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
					</div>
				</div>

				{/* Right Panel - Preview / Result */}
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg overflow-hidden">
					<div className="px-4 py-3 flex justify-between items-center">
						<span className="text-zinc-900 dark:text-white font-medium text-sm">
							{showResult ? 'Email Result' : 'Email Preview'}
						</span>
						{showResult && result && !isLoading && (
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
						)}
					</div>
					<Separator />

					{/* Loading state */}
					{showResult && isLoading && (
						<div className="p-8 flex items-center justify-center">
							<span data-loading="true" className="size-6" />
						</div>
					)}

					{/* Error state */}
					{showResult && error && !isLoading && (
						<div className="p-4 space-y-2">
							<p className="text-red-600 dark:text-red-400 text-sm">
								{error instanceof Error ? error.message : 'Failed to send email'}
							</p>
							<p className="text-zinc-500 dark:text-zinc-500 text-xs">
								Email sending requires deployment to Agentuity Cloud. This demo works when
								the Explorer is deployed.
							</p>
						</div>
					)}

					{/* Result state */}
					{showResult && result && !isLoading && (
						<div className="flex flex-col">
							<div className="px-4 py-3 space-y-1.5 border-b border-zinc-200 dark:border-zinc-900">
								<div className="flex items-center gap-2 text-xs">
									<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">
										From
									</span>
									<span className="text-zinc-700 dark:text-zinc-300 font-mono">
										{result.from}
									</span>
								</div>
								<div className="flex items-center gap-2 text-xs">
									<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">
										To
									</span>
									<span className="text-zinc-700 dark:text-zinc-300 font-mono">
										{result.to.join(', ')}
									</span>
								</div>
								<div className="flex items-center gap-2 text-xs">
									<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">
										ID
									</span>
									<span className="text-zinc-500 dark:text-zinc-500 font-mono truncate">
										{result.id}
									</span>
								</div>
							</div>
							<div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-900">
								<span className="text-zinc-900 dark:text-white text-sm font-medium">
									{result.subject}
								</span>
							</div>
							<div className="p-4 max-h-[400px] overflow-y-auto">
								<div
									className="text-sm"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generated by our agent, not user input
									dangerouslySetInnerHTML={{ __html: result.html }}
								/>
							</div>
						</div>
					)}

					{/* Preview state (before sending) */}
					{!showResult && (
						<div className="flex flex-col">
							<div className="px-4 py-3 space-y-1.5 border-b border-zinc-200 dark:border-zinc-900">
								<div className="flex items-center gap-2 text-xs">
									<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">
										From
									</span>
									<span className="text-zinc-700 dark:text-zinc-300 font-mono">
										{EMAIL_FROM}
									</span>
								</div>
								<div className="flex items-center gap-2 text-xs">
									<span className="text-zinc-500 dark:text-zinc-400 w-10 shrink-0">
										To
									</span>
									<span className="text-zinc-700 dark:text-zinc-300 font-mono">
										{EMAIL_TO.join(', ')}
									</span>
								</div>
							</div>
							<div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-900">
								<span className="text-zinc-900 dark:text-white text-sm font-medium">
									{preview.subject}
								</span>
							</div>
							<div className="p-4 max-h-[400px] overflow-y-auto">
								<div
									className="text-sm"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: HTML generated by our templates, not user input
									dangerouslySetInnerHTML={{ __html: preview.html }}
								/>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Callout Tip */}
			<div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg px-4 py-3">
				<p className="text-zinc-600 dark:text-zinc-400 text-xs">
					<span className="text-cyan-600 dark:text-cyan-400 font-medium">Tip:</span> You can
					route inbound emails to agent handlers using email destinations.
				</p>
			</div>
		</div>
	);
}
