import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/get-started/faq')({
	component: () => <MDXPage route="get-started/faq" />,
	staticData: { crumb: 'FAQ' },
});
