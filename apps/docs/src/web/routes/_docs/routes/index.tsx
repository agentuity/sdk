import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/routes/')({
	component: () => <MDXPage route="routes" />,
	staticData: { crumb: 'Routes' },
});
