import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/cookbook/patterns/opentelemetry-route-spans')({
	component: () => <MDXPage route="cookbook/patterns/opentelemetry-route-spans" />,
	staticData: { crumb: 'OpenTelemetry Spans' },
});
