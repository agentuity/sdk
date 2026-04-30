import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/deploy-operate/custom-domains')({
	component: () => <MDXPage route="deploy-operate/custom-domains" />,
	staticData: { crumb: 'Custom Domains' },
});
