import * as React from 'react';
import { ExternalLink, GitBranch } from 'lucide-react';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '../ui';
import { cn } from '../../lib/utils';
import { DOCS_VERSIONS, getCurrentVersion, isDocsVersion } from '../../lib/docs-versions';
import type { DocsVersion } from '../../lib/docs-versions';

interface DocsVersionPickerProps {
	className?: string;
}

export function DocsVersionPicker({ className }: DocsVersionPickerProps) {
	const [version, setVersion] = React.useState<DocsVersion>('v3');

	React.useEffect(() => {
		setVersion(getCurrentVersion());
	}, []);

	const handleVersionChange = React.useCallback(
		(value: string) => {
			if (!isDocsVersion(value) || value === version) return;
			// Other versions live on separate subdomains. Open in a new tab so the
			// current reading position is preserved; keep the picker on the current
			// version since this tab does not navigate.
			window.open(DOCS_VERSIONS[value].url, '_blank', 'noopener,noreferrer');
		},
		[version]
	);

	return (
		<div className={cn('w-full group-data-[collapsible=icon]:hidden', className)}>
			<Select value={version} onValueChange={handleVersionChange}>
				<SelectTrigger
					aria-label="Choose docs version"
					size="sm"
					className="h-8 w-full justify-between border-transparent bg-transparent px-2 text-xs font-medium text-sidebar-foreground/75 shadow-none hover:border-sidebar-border/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-[state=open]:border-sidebar-border data-[state=open]:bg-sidebar-accent"
				>
					<span className="flex min-w-0 items-center gap-2">
						<GitBranch className="size-3.5 shrink-0 text-sidebar-foreground/60" />
						<SelectValue>{DOCS_VERSIONS[version].label}</SelectValue>
					</span>
				</SelectTrigger>
				<SelectContent align="start">
					<SelectGroup>
						<SelectLabel>Docs version</SelectLabel>
						<SelectItem value="v3">{DOCS_VERSIONS.v3.label}</SelectItem>
						<SelectItem value="v2">
							<span className="flex items-center gap-1.5">
								{DOCS_VERSIONS.v2.label}
								<ExternalLink className="size-3 text-muted-foreground/75" />
							</span>
						</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	);
}
