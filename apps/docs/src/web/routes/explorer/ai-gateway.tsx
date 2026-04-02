import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/ai-gateway')({
	component: () => <DemoView demoId="ai-gateway" />,
	staticData: { crumb: 'Demo' },
});
