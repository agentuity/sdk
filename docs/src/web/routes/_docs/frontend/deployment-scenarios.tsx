import { createFileRoute, redirect } from '@tanstack/react-router';
import { RedirectFallback } from '../../../components/docs/RedirectFallback';
import { docsRedirects } from '../../../lib/docs-redirects';

const target = docsRedirects.frontendDeployment;

export const Route = createFileRoute('/_docs/frontend/deployment-scenarios')({
	beforeLoad: () => {
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true, statusCode: 301 });
		}
	},
	component: () => <RedirectFallback target={target} />,
	staticData: { crumb: 'Deployment Scenarios' },
});
