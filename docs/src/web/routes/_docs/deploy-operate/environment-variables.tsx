import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/deploy-operate/environment-variables')({
	component: () => <MDXPage route="deploy-operate/environment-variables" />,
	staticData: { crumb: 'Environment Variables' },
});
