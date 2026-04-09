import { createFileRoute, redirect } from '@tanstack/react-router';
import { RedirectFallback } from '../../../components/docs/RedirectFallback';

const target = '/agents/when-to-use';

export const Route = createFileRoute('/_docs/apis/when-to-use')({
	beforeLoad: () => {
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true });
		}
	},
	component: () => <RedirectFallback target={target} />,
});
