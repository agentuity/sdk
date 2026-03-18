'use client';

import type { ReactNode, ReactElement } from 'react';
import { Children, isValidElement } from 'react';
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
	children: ReactNode;
	className?: string;
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
 */
export function Tabs({ items, defaultValue, children, className }: TabsProps) {
	const tabs = Children.toArray(children).filter(
		(child): child is ReactElement<TabProps> => isValidElement(child) && child.type === Tab
	);

	return (
		<TabsRoot defaultValue={defaultValue ?? items[0]} className={cn('my-4', className)}>
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
