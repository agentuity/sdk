import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui';
import { cn } from '../../lib/utils';

const DOCS_VERSION_URLS = {
	v3: 'https://agentuity.dev/',
	v2: 'https://v2.agentuity.dev/',
} as const;

type DocsVersion = keyof typeof DOCS_VERSION_URLS;

function getCurrentVersion(): DocsVersion {
	if (typeof window === 'undefined') return 'v3';
	return window.location.hostname === 'v2.agentuity.dev' ? 'v2' : 'v3';
}

function isDocsVersion(value: string): value is DocsVersion {
	return value === 'v2' || value === 'v3';
}

interface DocsVersionPickerProps {
	className?: string;
}

export function DocsVersionPicker({ className }: DocsVersionPickerProps) {
	const [version, setVersion] = React.useState<DocsVersion>('v3');

	React.useEffect(() => {
		setVersion(getCurrentVersion());
	}, []);

	const handleVersionChange = React.useCallback((value: string) => {
		if (!isDocsVersion(value)) return;

		setVersion(value);
		window.location.assign(DOCS_VERSION_URLS[value]);
	}, []);

	return (
		<div className={cn('w-full', className)}>
			<Select value={version} onValueChange={handleVersionChange}>
				<SelectTrigger
					aria-label="Choose docs version"
					size="sm"
					className="h-9.5 w-full justify-between border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent align="start">
					<SelectItem value="v3">Latest</SelectItem>
					<SelectItem value="v2">Legacy (v2)</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
