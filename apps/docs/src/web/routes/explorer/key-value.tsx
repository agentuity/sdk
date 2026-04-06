import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/key-value')({
	component: () => <DemoView demoId="key-value" />,
	staticData: { crumb: 'Demo' },
});
