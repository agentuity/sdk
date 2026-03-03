import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/apis/when-to-use')({
	component: () => <MDXPage route="apis/when-to-use" />,
	staticData: { crumb: 'When to Use' },
});
