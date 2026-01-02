/**
 * Auth Pages - renders BetterAuth UI views based on URL path
 *
 * Uses @daveyplate/better-auth-ui for beautiful, pre-built auth components.
 */

import { AuthView, AccountView, OrganizationView } from '@daveyplate/better-auth-ui';

function BackButton() {
	return (
		<a
			href="/"
			className="fixed top-4 left-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors z-50"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="m12 19-7-7 7-7" />
				<path d="M19 12H5" />
			</svg>
			Back to Home
		</a>
	);
}

export function AuthPages() {
	const pathname = window.location.pathname;

	// Handle /account/* for account settings
	if (pathname === '/account' || pathname.startsWith('/account/')) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center p-4">
				<BackButton />
				<div className="w-full max-w-2xl">
					<AccountView pathname={pathname} />
				</div>
			</div>
		);
	}

	// Handle /organization/* for organization settings
	if (pathname === '/organization' || pathname.startsWith('/organization/')) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center p-4">
				<BackButton />
				<div className="w-full max-w-2xl">
					<OrganizationView pathname={pathname} />
				</div>
			</div>
		);
	}

	// Default: handle all /auth/* paths with AuthView
	// (sign-in, sign-up, forgot-password, reset-password, magic-link, etc.)
	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<BackButton />
			<div className="w-full max-w-md">
				<AuthView pathname={pathname} />
			</div>
		</div>
	);
}
