import { createFileRoute, redirect } from '@tanstack/react-router';
import { RedirectFallback } from '../../components/docs/RedirectFallback';
import { docsRedirects } from '../../lib/docs-redirects';

export const Route = createFileRoute('/explorer/evals')({
	beforeLoad: () => {
		if (typeof window !== 'undefined') {
			throw redirect({ to: docsRedirects.explorerEvals, replace: true, statusCode: 301 });
		}
	},
	component: () => <RedirectFallback target={docsRedirects.explorerEvals} />,
	staticData: { crumb: 'Demo' },
});
