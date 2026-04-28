import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/deploy-operate/')({
	component: () => <MDXPage route="deploy-operate" />,
	staticData: { crumb: 'Deploy & Operate' },
});
