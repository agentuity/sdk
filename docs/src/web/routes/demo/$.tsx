import { createFileRoute, redirect, useParams } from '@tanstack/react-router';
import { RedirectFallback } from '../../components/docs/RedirectFallback';
import { getDemoRedirectTarget } from '../../lib/docs-redirects';

export const Route = createFileRoute('/demo/$')({
	beforeLoad: ({ params }) => {
		const target = getDemoRedirectTarget(params._splat);
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true, statusCode: 301 });
		}
	},
	component: function DemoSplatRedirect() {
		const { _splat } = useParams({ from: '/demo/$' });
		return <RedirectFallback target={getDemoRedirectTarget(_splat)} />;
	},
});
