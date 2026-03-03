import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/get-started/project-structure')({
	component: () => <MDXPage route="get-started/project-structure" />,
	staticData: { crumb: 'Project Structure' },
});
