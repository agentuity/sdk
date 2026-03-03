import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/cookbook/')({
	component: () => <MDXPage route="cookbook" />,
	staticData: { crumb: 'Cookbook' },
});
