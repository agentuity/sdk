import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/cookbook/patterns/product-search')({
	component: () => <MDXPage route="cookbook/patterns/product-search" />,
	staticData: { crumb: 'Product Search' },
});
