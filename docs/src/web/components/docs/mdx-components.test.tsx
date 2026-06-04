import { expect, test } from 'bun:test';
import type { ComponentPropsWithoutRef, ReactElement } from 'react';
import { mdxComponents } from './mdx-components';

type LinkPropsForTest = {
	readonly to?: unknown;
	readonly hash?: unknown;
	readonly href?: unknown;
};

type AnchorComponent = (props: ComponentPropsWithoutRef<'a'>) => ReactElement<LinkPropsForTest>;

const Anchor = mdxComponents.a as AnchorComponent;

test('MDX internal hash links preserve the router hash separately from the route path', () => {
	const element = Anchor({
		href: '/services/ai-gateway#model-catalog',
		children: 'AI Gateway',
	});

	expect(element.props.to).toBe('/services/ai-gateway');
	expect(element.props.hash).toBe('model-catalog');
	expect(element.props.href).toBeUndefined();
});
