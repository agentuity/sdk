import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/deploy-operate/local-development')({
	component: () => <MDXPage route="deploy-operate/local-development" />,
	staticData: { crumb: 'Local Development' },
});
