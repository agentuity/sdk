import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/demo/agent-calls')({
	component: () => <DemoView demoId="agent-calls" />,
	staticData: { crumb: 'Demo' },
});
