import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/mdx-features')({
	component: () => <MDXPage route="reference/mdx-features" />,
	staticData: { crumb: 'MDX Features' },
});
