import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/database')({
	component: () => <DemoView demoId="database" />,
	staticData: { crumb: 'Demo' },
});
