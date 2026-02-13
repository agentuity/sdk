'use client';

import { useLocation } from '@tanstack/react-router';
import { ChevronDown, Copy, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui';
import { ClaudeIcon, OpenAIIcon } from '../icons';
import { cn } from '../../lib/utils';

type ActionType = 'copy-markdown' | 'view-markdown' | 'open-chatgpt' | 'open-claude';

interface ActionConfig {
	id: ActionType;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	handler: () => Promise<void>;
}

interface CopyPageDropdownProps {
	enhanced?: boolean;
}

const STORAGE_KEY = 'agentuity-copy-preference';

export function CopyPageDropdown({ enhanced = false }: CopyPageDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [preferredAction, setPreferredAction] = useState<ActionType>('copy-markdown');
	const [isInitialized, setIsInitialized] = useState(false);
	const location = useLocation();
	const pathname = location.pathname;

	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (
				stored &&
				['copy-markdown', 'view-markdown', 'open-chatgpt', 'open-claude'].includes(stored)
			) {
				setPreferredAction(stored as ActionType);
			}
		} catch {
			// Ignore corrupted storage
		} finally {
			setIsInitialized(true);
		}
	}, []);

	const savePreference = (action: ActionType) => {
		try {
			localStorage.setItem(STORAGE_KEY, action);
			setPreferredAction(action);
		} catch {
			// Storage unavailable
		}
	};

	const handleCopyMarkdown = async () => {
		try {
			setIsLoading(true);
			const mdUrl = `${pathname}.md`;
			const response = await fetch(mdUrl);
			if (!response.ok) throw new Error('Failed to fetch content');

			const markdown = await response.text();

			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(markdown);
			} else {
				const textArea = document.createElement('textarea');
				textArea.value = markdown;
				textArea.style.position = 'fixed';
				textArea.style.left = '-999999px';
				textArea.style.top = '-999999px';
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				document.execCommand('copy');
				document.body.removeChild(textArea);
			}
		} catch {
			// Clipboard unavailable
		} finally {
			setIsLoading(false);
			setIsOpen(false);
		}
	};

	const handleViewMarkdown = async () => {
		const mdUrl = `${pathname}.md`;
		window.open(mdUrl, '_blank');
		setIsOpen(false);
	};

	const handleOpenInChatGPT = async () => {
		const currentUrl = `${window.location.origin}${pathname}`;
		const chatGPTUrl = `https://chatgpt.com/?hints=search&prompt=${encodeURIComponent(`Read from ${currentUrl} so I can ask questions about it`)}`;
		const newWindow = window.open(chatGPTUrl, '_blank');
		if (!newWindow) {
			window.location.href = chatGPTUrl;
		}
		setIsOpen(false);
	};

	const handleOpenInClaude = async () => {
		const currentUrl = `${window.location.origin}${pathname}`;
		const claudeUrl = `https://claude.ai/new?q=${encodeURIComponent(`Read from ${currentUrl} so I can ask questions about it`)}`;
		const newWindow = window.open(claudeUrl, '_blank');
		if (!newWindow) {
			window.location.href = claudeUrl;
		}
		setIsOpen(false);
	};

	const defaultAction: ActionConfig = {
		id: 'copy-markdown',
		label: 'Copy as Markdown',
		icon: Copy,
		handler: handleCopyMarkdown,
	};

	const actionConfigs: ActionConfig[] = [
		defaultAction,
		{
			id: 'view-markdown',
			label: 'View as Markdown',
			icon: FileText,
			handler: handleViewMarkdown,
		},
		{
			id: 'open-chatgpt',
			label: 'Open in ChatGPT',
			icon: OpenAIIcon,
			handler: handleOpenInChatGPT,
		},
		{
			id: 'open-claude',
			label: 'Open in Claude',
			icon: ClaudeIcon,
			handler: handleOpenInClaude,
		},
	];

	const primaryAction =
		actionConfigs.find((action) => action.id === preferredAction) ?? defaultAction;

	const handlePrimaryAction = async () => {
		await primaryAction.handler();
	};

	const handleActionSelect = async (actionId: ActionType) => {
		savePreference(actionId);
		const action = actionConfigs.find((a) => a.id === actionId);
		if (action) {
			await action.handler();
		}
	};

	if (!isInitialized) {
		return null;
	}

	if (enhanced) {
		return (
			<div className="inline-flex rounded-md overflow-hidden border border-zinc-200 dark:border-zinc-800">
				<button
					type="button"
					onClick={handlePrimaryAction}
					disabled={isLoading}
					aria-label={`${primaryAction.label} (primary action)`}
					className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-200 disabled:opacity-50 touch-manipulation border-r border-zinc-200 dark:border-zinc-800"
				>
					<primaryAction.icon className="size-3.5" />
					{primaryAction.label}
				</button>
				<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="More copy options"
							className="inline-flex items-center px-1.5 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-200 touch-manipulation"
						>
							<ChevronDown className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-auto min-w-48">
						{actionConfigs.map((action) => (
							<DropdownMenuItem
								key={action.id}
								onClick={() => handleActionSelect(action.id)}
								disabled={isLoading}
								className={cn(
									'flex items-center gap-2 whitespace-nowrap',
									action.id === preferredAction && 'bg-zinc-100 dark:bg-zinc-800'
								)}
							>
								<action.icon className="size-4" />
								{action.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	}

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Copy page options"
					className="flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 border border-zinc-200 dark:border-zinc-800 rounded-md size-8 hover:border-cyan-400 dark:hover:border-cyan-600"
				>
					<Copy className="size-4 text-zinc-500 dark:text-zinc-400" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-auto min-w-48">
				{actionConfigs.map((action) => (
					<DropdownMenuItem
						key={action.id}
						onClick={() => handleActionSelect(action.id)}
						disabled={isLoading}
						className={cn(
							'flex items-center gap-2 whitespace-nowrap',
							action.id === preferredAction && 'bg-zinc-100 dark:bg-zinc-800'
						)}
					>
						<action.icon className="size-4" />
						{action.label}
						{action.id === preferredAction && (
							<span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
								Default
							</span>
						)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
