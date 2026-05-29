import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/braintrust-evals')({
	component: () => <MDXPage route="cookbook/patterns/braintrust-evals" />,
	staticData: { crumb: 'Braintrust Evals' },
});
