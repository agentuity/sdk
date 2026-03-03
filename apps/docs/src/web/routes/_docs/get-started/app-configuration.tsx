import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/get-started/app-configuration')({
	component: () => <MDXPage route="get-started/app-configuration" />,
	staticData: { crumb: 'App Configuration' },
});
