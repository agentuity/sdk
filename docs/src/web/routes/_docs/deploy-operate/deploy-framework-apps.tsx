import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/deploy-operate/deploy-framework-apps')({
	component: () => <MDXPage route="deploy-operate/deploy-framework-apps" />,
	staticData: { crumb: 'Deploy Framework Apps' },
});
