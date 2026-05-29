import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/langfuse-otel-tracing')({
	component: () => <MDXPage route="cookbook/patterns/langfuse-otel-tracing" />,
	staticData: { crumb: 'Langfuse Tracing' },
});
