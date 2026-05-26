import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/migration/runtime-to-frameworks')({
	component: () => <MDXPage route="migration/runtime-to-frameworks" />,
	staticData: { crumb: 'Runtime to Frameworks' },
});
