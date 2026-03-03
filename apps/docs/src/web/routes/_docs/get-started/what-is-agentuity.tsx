import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/get-started/what-is-agentuity')({
	component: () => <MDXPage route="get-started/what-is-agentuity" />,
	staticData: { crumb: 'What is Agentuity?' },
});
