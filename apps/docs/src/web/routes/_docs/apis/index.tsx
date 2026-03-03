import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/apis/')({
	component: () => <MDXPage route="apis" />,
	staticData: { crumb: 'APIs' },
});
