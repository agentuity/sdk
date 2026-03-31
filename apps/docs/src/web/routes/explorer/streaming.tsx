import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/streaming')({
	component: () => <DemoView demoId="streaming" />,
	staticData: { crumb: 'Demo' },
});
