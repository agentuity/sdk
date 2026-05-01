import type { ReactNode } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
	AuthUIProvider,
	AuthView,
	UserView,
	useAuthenticate,
} from '@daveyplate/better-auth-ui';
import { hc } from 'hono/client';
import { AnimatePresence, motion } from 'motion/react';
import { Toaster, toast } from 'sonner';
import type { ApiRouter } from '../api/index';
import { authClient } from './auth-client';
import './App.css';

const client = hc<ApiRouter>('/api');

const NEXT_STEPS: ReadonlyArray<{
	readonly key: string;
	readonly title: string;
	readonly text: ReactNode;
}> = [
	{
		key: 'customize-auth-routes',
		title: 'Customize auth routes',
		text: (
			<>
				Edit <code className="text-white">src/api/index.ts</code> to change how your app
				handles auth requests.
			</>
		),
	},
	{
		key: 'change-auth-options',
		title: 'Change auth options',
		text: (
			<>
				Edit <code className="text-white">src/auth.ts</code> to configure Better Auth.
			</>
		),
	},
	{
		key: 'update-frontend',
		title: 'Update the frontend',
		text: (
			<>
				Modify <code className="text-white">src/web/App.tsx</code> to build your auth UI.
			</>
		),
	},
	{
		key: 'deploy-with-auth',
		title: 'Deploy with auth',
		text: (
			<>
				Set <code className="text-white">DATABASE_URL</code>,{' '}
				<code className="text-white">AGENTUITY_AUTH_SECRET</code>, and{' '}
				<code className="text-white">BETTER_AUTH_URL</code> before deploying.
			</>
		),
	},
];

interface ProtectedRouteResult {
	readonly authMethod: string;
	readonly email: string;
	readonly id: string;
	readonly memberSince: string | null;
	readonly name: string | null;
}

function formatDate(value: string | null | undefined): string {
	if (!value) return 'Not set';
	try {
		return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
	} catch {
		return value;
	}
}

interface SessionFieldPopup {
	readonly title: ReactNode;
	readonly description: ReactNode;
}

interface SessionField {
	readonly key: string;
	readonly label: string;
	readonly value: string;
	readonly popup: SessionFieldPopup;
}

function SessionFieldValue({ value, popup }: { value: string; popup: SessionFieldPopup }) {
	return (
		<span className="group relative inline-block">
			<span className="border-b border-dashed border-gray-700 cursor-help transition-colors duration-200 group-hover:border-b-cyan-400">
				{value}
			</span>
			<div className="hidden group-hover:flex absolute z-10 bg-gray-900 border border-gray-800 rounded-lg p-4 leading-normal shadow-2xl text-left w-64 flex-col gap-2 left-0 top-full mt-2 md:left-full md:ml-3 md:top-0 md:mt-0">
				<div className="text-xs font-mono text-cyan-400">{popup.title}</div>
				<p className="text-gray-400 text-xs leading-relaxed">{popup.description}</p>
			</div>
		</span>
	);
}

function SessionDetailGrid({ fields }: { fields: ReadonlyArray<SessionField> }) {
	return (
		<dl className="grid grid-cols-[max-content_max-content] gap-x-6 gap-y-2 text-sm">
			{fields.map((field) => (
				<Fragment key={field.key}>
					<dt className="text-gray-500">{field.label}</dt>
					<dd className="text-gray-200 font-medium">
						<SessionFieldValue value={field.value} popup={field.popup} />
					</dd>
				</Fragment>
			))}
		</dl>
	);
}

interface SignedInPanelProps {
	readonly isSigningOut: boolean;
	readonly onSignOut: () => void;
}

function SignedInPanel({ isSigningOut, onSignOut }: SignedInPanelProps) {
	const { user, isPending } = useAuthenticate();

	return (
		<div className="bg-black border border-gray-900 rounded-lg p-6 shadow-2xl flex flex-wrap items-center justify-between gap-4">
			<UserView user={user} isPending={isPending} />

			<button
				className="border border-gray-800 rounded-md text-gray-300 px-4 py-2 text-sm transition-colors cursor-pointer hover:bg-gray-900 hover:text-white hover:border-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
				data-loading={isSigningOut}
				disabled={isSigningOut}
				onClick={onSignOut}
				type="button"
			>
				{isSigningOut ? 'Signing out' : 'Sign out'}
			</button>
		</div>
	);
}

function AgentuityLogo() {
	return (
		<svg
			aria-hidden="true"
			className="h-auto mb-4 w-12"
			fill="none"
			height="191"
			viewBox="0 0 220 191"
			width="220"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				clipRule="evenodd"
				d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z"
				fill="var(--color-cyan-500)"
				fillRule="evenodd"
			/>
			<path
				clipRule="evenodd"
				d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z"
				fill="var(--color-cyan-500)"
				fillRule="evenodd"
			/>
		</svg>
	);
}

function getPathFromHref(href: string): string {
	const url = new URL(href, window.location.origin);
	return url.pathname;
}

interface AuthLinkProps {
	readonly href: string;
	readonly className?: string;
	readonly children: ReactNode;
}

function makeAuthLink(navigate: (href: string) => void) {
	return function AuthLink({ href, className, children }: AuthLinkProps) {
		const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
			if (
				event.defaultPrevented ||
				event.button !== 0 ||
				event.metaKey ||
				event.ctrlKey ||
				event.shiftKey ||
				event.altKey
			) {
				return;
			}
			event.preventDefault();
			navigate(href);
		};
		return (
			<a className={className} href={href} onClick={handleClick}>
				{children}
			</a>
		);
	};
}

interface AuthSwitchProps {
	readonly signedOut: ReactNode;
	readonly signedIn: ReactNode;
}

// Hold the previous auth state during pending transitions so the layout
// doesn't collapse between Better Auth's session refetches
function AuthSwitch({ signedOut, signedIn }: AuthSwitchProps) {
	const { user, isPending } = useAuthenticate();
	const [isSignedIn, setIsSignedIn] = useState(!!user);

	useEffect(() => {
		if (!isPending) setIsSignedIn(!!user);
	}, [user, isPending]);

	return (
		<AnimatePresence initial={false} mode="wait">
			<motion.div
				key={isSignedIn ? 'in' : 'out'}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.18, ease: 'easeOut' }}
			>
				{isSignedIn ? signedIn : signedOut}
			</motion.div>
		</AnimatePresence>
	);
}

export function App() {
	const [pathname, setPathname] = useState(() => window.location.pathname);
	const [routeResult, setRouteResult] = useState<ProtectedRouteResult | null>(null);
	const [routeError, setRouteError] = useState<string | null>(null);
	const [isCheckingRoute, setIsCheckingRoute] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);

	useEffect(() => {
		const handlePopState = () => setPathname(window.location.pathname);
		window.addEventListener('popstate', handlePopState);
		return () => window.removeEventListener('popstate', handlePopState);
	}, []);

	const navigate = useCallback((href: string) => {
		window.history.pushState(null, '', href);
		setPathname(getPathFromHref(href));
	}, []);

	const replace = useCallback((href: string) => {
		window.history.replaceState(null, '', href);
		setPathname(getPathFromHref(href));
	}, []);

	const checkProtectedRoute = useCallback(async () => {
		setIsCheckingRoute(true);
		setRouteError(null);
		try {
			const res = await client.me.$get();
			if (!res.ok) {
				throw new Error(`GET /api/me returned ${res.status}`);
			}
			setRouteResult(await res.json());
		} catch (err) {
			setRouteResult(null);
			setRouteError(err instanceof Error ? err.message : 'Could not call /api/me');
		} finally {
			setIsCheckingRoute(false);
		}
	}, []);

	const handleSignOut = useCallback(async () => {
		setIsSigningOut(true);
		try {
			await authClient.signOut();
			setRouteResult(null);
			setRouteError(null);
			replace('/');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Sign out failed');
		} finally {
			setIsSigningOut(false);
		}
	}, [replace]);

	const authPathname = pathname.startsWith('/auth/') ? pathname : '/auth/sign-in';
	const AuthLink = useMemo(() => makeAuthLink(navigate), [navigate]);

	return (
		<AuthUIProvider
			authClient={authClient}
			basePath="/auth"
			credentials={{ forgotPassword: false }}
			Link={AuthLink}
			navigate={navigate}
			redirectTo="/"
			replace={replace}
		>
			<div className="text-white flex font-sans justify-center min-h-screen">
				<div className="flex flex-col gap-8 max-w-3xl p-16 w-full">
					{/* Hero */}
					<div className="items-center flex flex-col gap-2 justify-center mb-2 relative text-center">
						<AgentuityLogo />

						<h1 className="text-5xl font-thin">Agentuity Auth</h1>

						<p className="text-gray-400 text-lg">
							Auth routes, Postgres sessions, and a protected API, with{' '}
							<span className="italic font-serif">Better Auth</span>
						</p>
					</div>

					<AuthSwitch
						signedOut={
							<div className="flex justify-center">
								<div className="relative w-full max-w-sm">
									<AnimatePresence initial={false} mode="popLayout">
										<motion.div
											key={authPathname}
											initial={{ opacity: 0, y: 4 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: -4 }}
											transition={{ duration: 0.18, ease: 'easeOut' }}
										>
											<AuthView
												className="[&_button]:cursor-pointer [&_button:disabled]:cursor-not-allowed"
												classNames={{
													footerLink:
														'transition-colors hover:text-cyan-300 focus-visible:text-cyan-300',
												}}
												pathname={authPathname}
												redirectTo="/"
											/>
										</motion.div>
									</AnimatePresence>
								</div>
							</div>
						}
						signedIn={
							<div className="flex flex-col gap-8">
								<SignedInPanel isSigningOut={isSigningOut} onSignOut={handleSignOut} />

								<div className="bg-black border border-gray-900 rounded-lg p-8 shadow-2xl flex flex-col gap-6">
							<div>
								<h2 className="text-white text-xl font-normal leading-none m-0 mb-3">
									Protected API
								</h2>
								<p className="text-gray-400 text-sm m-0">
									<code className="text-white">GET /api/me</code> reads the signed-in
									user from your Better Auth session.
								</p>
							</div>

							<div className="relative self-start group">
								<div className="absolute inset-0 bg-linear-to-r from-cyan-700 via-blue-500 to-purple-600 rounded-lg blur-xl opacity-75 group-hover:blur-2xl group-hover:opacity-100 transition-all duration-700" />
								<div className="absolute inset-0 bg-cyan-500/50 rounded-lg blur-3xl opacity-50" />
								<button
									className="relative font-semibold text-white px-4 py-2 bg-gray-950 rounded-lg shadow-2xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
									data-loading={isCheckingRoute}
									disabled={isCheckingRoute}
									onClick={checkProtectedRoute}
									type="button"
								>
									{isCheckingRoute ? 'Checking' : 'Check session'}
								</button>
							</div>

							{isCheckingRoute ? (
								<div
									className="text-sm bg-gray-950 border border-gray-800 rounded-md text-gray-600 py-3 px-4"
									data-loading
								/>
							) : routeError ? (
								<div className="text-sm bg-gray-950 border border-red-900/60 rounded-md text-red-300 py-3 px-4">
									{routeError}
								</div>
							) : !routeResult ? (
								<div className="text-sm bg-gray-950 border border-gray-800 rounded-md text-gray-600 py-3 px-4">
									Click Check session to call <code>/api/me</code>
								</div>
							) : (
								<div className="flex flex-col gap-4">
									<div className="text-sm bg-gray-950 border border-gray-800 rounded-md text-cyan-500 py-3 px-4">
										{routeResult.email} authenticated with {routeResult.authMethod}
									</div>

									<SessionDetailGrid
										fields={[
											{
												key: 'user',
												label: 'User',
												value: `${routeResult.id.slice(0, 12)}...`,
												popup: {
													title: 'user.id',
													description: (
														<>
															Stable primary key from the{' '}
															<strong className="text-gray-200">user</strong>{' '}
															table. Better Auth assigns it on sign-up. Use it
															as a foreign key when you add per-user tables in{' '}
															<strong className="text-gray-200">src/schema.ts</strong>.
														</>
													),
												},
											},
											{
												key: 'memberSince',
												label: 'Member since',
												value: formatDate(routeResult.memberSince),
												popup: {
													title: 'user.createdAt',
													description: (
														<>Better Auth sets this when the account is created.</>
													),
												},
											},
										]}
									/>
								</div>
							)}
						</div>
								</div>
							}
						/>

					<div className="bg-black border border-gray-900 rounded-lg p-8">
						<h2 className="text-white text-xl font-normal leading-none m-0 mb-6">
							Next Steps
						</h2>

						<div className="flex flex-col gap-6">
							{NEXT_STEPS.map((step) => (
								<div key={step.key} className="items-start flex gap-3">
									<div className="items-center bg-green-950 border border-green-500 rounded flex size-4 shrink-0 justify-center">
										<svg
											aria-hidden="true"
											className="size-2.5"
											fill="none"
											height="24"
											stroke="var(--color-green-500)"
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											viewBox="0 0 24 24"
											width="24"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path d="M20 6 9 17l-5-5"></path>
										</svg>
									</div>

									<div>
										<h3 className="text-white text-sm font-normal -mt-0.5 mb-0.5">
											{step.title}
										</h3>

										<p className="text-gray-400 text-xs">{step.text}</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
			<Toaster richColors />
		</AuthUIProvider>
	);
}
