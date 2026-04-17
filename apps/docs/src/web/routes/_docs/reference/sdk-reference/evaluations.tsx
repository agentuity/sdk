import { createFileRoute, redirect } from '@tanstack/react-router';
import { RedirectFallback } from '../../../../components/docs/RedirectFallback';
import { docsRedirects } from '../../../../lib/docs-redirects';

const target = docsRedirects.referenceSdkEvaluations;

export const Route = createFileRoute('/_docs/reference/sdk-reference/evaluations')({
	beforeLoad: () => {
		if (typeof window !== 'undefined') {
			throw redirect({ to: target, replace: true, statusCode: 301 });
		}
	},
	component: () => <RedirectFallback target={target} />,
	staticData: { crumb: 'Evaluations' },
});
