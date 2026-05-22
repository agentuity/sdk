import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/routes/explicit-routing')({
	component: () => <MDXPage route="routes/explicit-routing" />,
	staticData: { crumb: 'Explicit Routing' },
});
