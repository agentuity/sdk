import * as React from 'react';
import { FileTextIcon, LayoutGridIcon } from 'lucide-react';
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '../ui';
import { navData, type NavItem } from './nav-data';

interface SearchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (page: string) => void;
}

// Recursively collect all leaf nav items with URLs
function collectItems(items: NavItem[], section: string): Array<NavItem & { section: string; url: string }> {
	const result: Array<NavItem & { section: string; url: string }> = [];
	for (const item of items) {
		if (item.url) {
			result.push({ ...item, url: item.url, section });
		}
		if (item.items) {
			result.push(...collectItems(item.items, section));
		}
	}
	return result;
}

// Flatten nav data for search
function getAllItems(): Array<NavItem & { section: string; url: string }> {
	const items: Array<NavItem & { section: string; url: string }> = [];

	for (const section of navData) {
		items.push(...collectItems(section.items, section.title));
	}

	return items;
}

export function SearchDialog({ open, onOpenChange, onSelect }: SearchDialogProps) {
	const allItems = React.useMemo(() => getAllItems(), []);

	const handleSelect = (url: string) => {
		onSelect(url.slice(1)); // Remove # prefix
		onOpenChange(false);
	};

	// Group items by section for display
	const groupedItems = React.useMemo(() => {
		const groups: Record<string, Array<NavItem & { section: string; url: string }>> = {};
		for (const item of allItems) {
			const section = item.section;
			if (!groups[section]) {
				groups[section] = [];
			}
			groups[section]!.push(item);
		}
		return groups;
	}, [allItems]);

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search"
			description="Search for pages and demos"
		>
			<CommandInput placeholder="Search pages..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>

				{Object.entries(groupedItems).map(([section, items]) => (
					<CommandGroup key={section} heading={section}>
						{items.map((item) => (
							<CommandItem
								key={item.url}
								value={`${item.title} ${section}`}
								onSelect={() => handleSelect(item.url)}
							>
								{section === 'SDK Explorer' ? (
									<LayoutGridIcon className="mr-2 size-4" />
								) : (
									<FileTextIcon className="mr-2 size-4" />
								)}
								<span>{item.title}</span>
							</CommandItem>
						))}
					</CommandGroup>
				))}
			</CommandList>
		</CommandDialog>
	);
}
