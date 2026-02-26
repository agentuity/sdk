import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/demo/handler-context')({
	component: () => <DemoView demoId="handler-context" />,
	staticData: { crumb: 'Demo' },
});
