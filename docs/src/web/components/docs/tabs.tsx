'use client';

import type { ReactNode, ReactElement } from 'react';
import { Children, isValidElement, useState, useLayoutEffect, useCallback } from 'react';
import { Tabs as TabsRoot, TabsList, TabsTrigger, TabsContent } from '../ui';
import { cn } from '../../lib/utils';

interface TabProps {
	value: string;
	children: ReactNode;
	className?: string;
}

interface TabsProps {
	items: string[];
	defaultValue?: string;
	hashSync?: boolean;
	children: ReactNode;
	className?: string;
}

/** Convert a tab label to a URL hash slug: "v1 → v2" becomes "v1-to-v2" */
function toSlug(label: string): string {
	return label
		.toLowerCase()
		.replace(/→/g, 'to')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/** Find the tab item matching a hash slug */
function fromHash(hash: string, items: string[]): string | undefined {
	const slug = hash.replace(/^#/, '');
	return items.find((item) => toSlug(item) === slug);
}

/**
 * Tab panel content - used inside <Tabs>
 * @example
 * <Tab value="npm">npm install agentuity</Tab>
 */
export function Tab({ value, children, className }: TabProps) {
	return (
		<TabsContent value={value} className={cn('mt-2', className)}>
			{children}
		</TabsContent>
	);
}

/**
 * Tabs container for MDX documentation
 * @example
 * <Tabs items={["npm", "bun"]}>
 *   <Tab value="npm">npm install</Tab>
 *   <Tab value="bun">bun add</Tab>
 * </Tabs>
 *
 * Enable hashSync to sync the active tab with the URL hash:
 * <Tabs items={["v0 → v1", "v1 → v2"]} hashSync>
 */
export function Tabs({ items, defaultValue, hashSync, children, className }: TabsProps) {
	const tabs = Children.toArray(children).filter(
		(child): child is ReactElement<TabProps> => isValidElement(child) && child.type === Tab
	);

	const initial = defaultValue ?? items[0];
	const [activeTab, setActiveTab] = useState(initial);

	useLayoutEffect(() => {
		if (!hashSync || typeof window === 'undefined') return;

		const match = fromHash(window.location.hash, items);
		if (match) {
			setActiveTab(match);
		}

		const onHashChange = () => {
			const m = fromHash(window.location.hash, items);
			if (m) setActiveTab(m);
		};
		window.addEventListener('hashchange', onHashChange);
		return () => window.removeEventListener('hashchange', onHashChange);
	}, [hashSync, items]);

	const handleChange = useCallback(
		(value: string) => {
			setActiveTab(value);
			if (hashSync && typeof window !== 'undefined') {
				window.history.replaceState(null, '', `#${toSlug(value)}`);
			}
		},
		[hashSync]
	);

	return (
		<TabsRoot value={activeTab} onValueChange={handleChange} className={cn('my-4', className)}>
			<TabsList>
				{items.map((item) => (
					<TabsTrigger key={item} value={item}>
						{item}
					</TabsTrigger>
				))}
			</TabsList>
			{tabs}
		</TabsRoot>
	);
}
