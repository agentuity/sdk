import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/object-storage')({
	component: () => <DemoView demoId="object-storage" />,
	staticData: { crumb: 'Demo' },
});
