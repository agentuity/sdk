import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/get-started/import-existing-app')({
	component: () => <MDXPage route="get-started/import-existing-app" />,
	staticData: { crumb: 'Add Agentuity to an existing app' },
});
