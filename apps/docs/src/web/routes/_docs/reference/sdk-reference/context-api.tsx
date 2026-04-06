import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/context-api')({
	component: () => <MDXPage route="reference/sdk-reference/context-api" />,
	staticData: { crumb: 'Context API' },
});
