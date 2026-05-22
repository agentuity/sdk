import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/github-app')({
	component: () => <MDXPage route="reference/github-app" />,
	staticData: { crumb: 'GitHub App' },
});
