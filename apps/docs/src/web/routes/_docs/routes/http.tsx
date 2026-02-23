import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/routes/http')({
	component: () => <MDXPage route="routes/http" />,
	staticData: { crumb: 'HTTP' },
});
