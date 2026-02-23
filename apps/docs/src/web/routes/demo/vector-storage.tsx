import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/demo/vector-storage')({
	component: () => <DemoView demoId="vector-storage" />,
	staticData: { crumb: 'Demo' },
});
