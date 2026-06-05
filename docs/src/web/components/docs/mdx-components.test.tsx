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

test('MDX non-route absolute links render as normal anchors', () => {
	const element = Anchor({
		href: '/pricing',
		children: 'Pricing',
	});

	expect(element.props.href).toBe('/pricing');
	expect(element.props.to).toBeUndefined();
});

test('MDX internal links can target non-MDX app routes', () => {
	const element = Anchor({
		href: '/explorer/hello',
		children: 'Hello demo',
	});

	expect(element.props.to).toBe('/explorer/hello');
	expect(element.props.href).toBeUndefined();
});

test('MDX internal links normalize trailing slashes', () => {
	const element = Anchor({
		href: '/services/ai-gateway/',
		children: 'AI Gateway',
	});

	expect(element.props.to).toBe('/services/ai-gateway');
	expect(element.props.href).toBeUndefined();
});

test('MDX links with query strings stay normal anchors', () => {
	const element = Anchor({
		href: '/services/ai-gateway?model=openai/gpt-5.5',
		children: 'AI Gateway model',
	});

	expect(element.props.href).toBe('/services/ai-gateway?model=openai/gpt-5.5');
	expect(element.props.to).toBeUndefined();
});

test('MDX protocol-relative links stay normal anchors', () => {
	const element = Anchor({
		href: '//example.com/docs',
		children: 'External docs',
	});

	expect(element.props.href).toBe('//example.com/docs');
	expect(element.props.to).toBeUndefined();
});
