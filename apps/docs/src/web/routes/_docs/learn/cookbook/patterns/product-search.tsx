import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPage } from '../../../../../components/docs/placeholder-page';

export const Route = createFileRoute('/_docs/learn/cookbook/patterns/product-search')({
	component: () => (
		<PlaceholderPage title="Product Search" description="Build a product search agent with vector storage." />
	),
	staticData: { crumb: 'Product Search' },
});
