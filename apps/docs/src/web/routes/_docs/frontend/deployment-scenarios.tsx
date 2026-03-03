import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/frontend/deployment-scenarios')({
	component: () => <MDXPage route="frontend/deployment-scenarios" />,
	staticData: { crumb: 'Deployment Scenarios' },
});
