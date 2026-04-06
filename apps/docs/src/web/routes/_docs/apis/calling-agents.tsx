import { createFileRoute, redirect } from '@tanstack/react-router';
import { RedirectFallback } from '../../../components/docs/RedirectFallback';

const target = '/routes/calling-agents';

export const Route = createFileRoute('/_docs/apis/calling-agents')({
	beforeLoad: () => {
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true });
		}
	},
	component: () => <RedirectFallback target={target} />,
});
