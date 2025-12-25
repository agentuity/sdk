/**
 * Auth Demo Components
 *
 * Minimal login/signup UI for testing BetterAuth integration.
 */

import { useState, type FormEvent } from 'react';
import { authClient, useSession } from './auth-client';
import { useAPI, useAuth } from '@agentuity/react';

export function LoginForm() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [mode, setMode] = useState<'signin' | 'signup'>('signin');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const { setAuthHeader } = useAuth();

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			if (mode === 'signin') {
				const result = await authClient.signIn.email({
					email,
					password,
				});
				if (result.error) {
					setError(result.error.message || 'Sign in failed');
				} else if (result.data?.token) {
					setAuthHeader?.(`Bearer ${result.data.token}`);
				}
			} else {
				const result = await authClient.signUp.email({
					email,
					password,
					name: email.split('@')[0] ?? 'User',
				});
				if (result.error) {
					setError(result.error.message || 'Sign up failed');
				} else if (result.data?.token) {
					setAuthHeader?.(`Bearer ${result.data.token}`);
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="auth-form">
			<h3>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</h3>

			<form onSubmit={onSubmit}>
				<input
					type="email"
					placeholder="Email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					disabled={loading}
					required
				/>
				<input
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					disabled={loading}
					required
					minLength={8}
				/>
				<button type="submit" disabled={loading}>
					{loading ? 'Loading...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
				</button>
			</form>

			{error && <div className="error">{error}</div>}

			<button
				type="button"
				className="toggle-mode"
				onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
			>
				{mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
			</button>

			<style>{`
				.auth-form {
					background: #18181b;
					border: 1px solid #27272a;
					border-radius: 0.5rem;
					padding: 1.5rem;
					max-width: 320px;
				}
				.auth-form h3 {
					margin: 0 0 1rem 0;
					font-weight: 500;
				}
				.auth-form form {
					display: flex;
					flex-direction: column;
					gap: 0.75rem;
				}
				.auth-form input {
					background: #09090b;
					border: 1px solid #3f3f46;
					border-radius: 0.375rem;
					color: #fff;
					padding: 0.625rem 0.75rem;
					font-size: 0.875rem;
				}
				.auth-form button[type="submit"] {
					background: linear-gradient(to right, #155e75, #3b82f6);
					border: none;
					border-radius: 0.375rem;
					color: #fff;
					cursor: pointer;
					padding: 0.625rem 1rem;
					font-size: 0.875rem;
				}
				.auth-form button[type="submit"]:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}
				.auth-form .error {
					background: #450a0a;
					border: 1px solid #dc2626;
					border-radius: 0.375rem;
					color: #fca5a5;
					font-size: 0.75rem;
					margin-top: 0.75rem;
					padding: 0.5rem;
				}
				.auth-form .toggle-mode {
					background: transparent;
					border: none;
					color: #71717a;
					cursor: pointer;
					font-size: 0.75rem;
					margin-top: 1rem;
					padding: 0;
				}
				.auth-form .toggle-mode:hover {
					color: #a1a1aa;
				}
			`}</style>
		</div>
	);
}

export function UserProfile() {
	const { data: session, isPending } = useSession();
	const { isAuthenticated, setAuthHeader } = useAuth();
	const { data: meData, refetch } = useAPI('GET /api/me');
	
	const userData = meData as { id?: string; name?: string; email?: string } | undefined;

	const handleSignOut = async () => {
		await authClient.signOut();
		setAuthHeader?.(null);
	};

	const handleTestProtectedRoute = () => {
		refetch();
	};

	if (isPending) {
		return <div className="profile">Loading session...</div>;
	}

	if (!session?.user && !isAuthenticated) {
		return null;
	}

	return (
		<div className="profile">
			<h3>User Profile</h3>

			<div className="profile-info">
				<p>
					<strong>Email:</strong> {session?.user?.email || userData?.email || 'Unknown'}
				</p>
				<p>
					<strong>Name:</strong> {session?.user?.name || userData?.name || 'Unknown'}
				</p>
				<p>
					<strong>ID:</strong> {session?.user?.id || userData?.id || 'Unknown'}
				</p>
			</div>

			<div className="profile-actions">
				<button onClick={handleTestProtectedRoute}>Test /api/me</button>
				<button onClick={handleSignOut} className="signout">
					Sign Out
				</button>
			</div>

			{userData && (
				<div className="api-response">
					<strong>/api/me response:</strong>
					<pre>{JSON.stringify(userData, null, 2)}</pre>
				</div>
			)}

			<style>{`
				.profile {
					background: #18181b;
					border: 1px solid #27272a;
					border-radius: 0.5rem;
					padding: 1.5rem;
					max-width: 400px;
				}
				.profile h3 {
					margin: 0 0 1rem 0;
					font-weight: 500;
				}
				.profile-info {
					font-size: 0.875rem;
				}
				.profile-info p {
					margin: 0.25rem 0;
				}
				.profile-actions {
					display: flex;
					gap: 0.5rem;
					margin-top: 1rem;
				}
				.profile-actions button {
					background: #27272a;
					border: 1px solid #3f3f46;
					border-radius: 0.375rem;
					color: #fff;
					cursor: pointer;
					padding: 0.5rem 1rem;
					font-size: 0.75rem;
				}
				.profile-actions button:hover {
					background: #3f3f46;
				}
				.profile-actions .signout {
					background: #450a0a;
					border-color: #dc2626;
				}
				.profile-actions .signout:hover {
					background: #7f1d1d;
				}
				.api-response {
					background: #09090b;
					border: 1px solid #3f3f46;
					border-radius: 0.375rem;
					font-size: 0.75rem;
					margin-top: 1rem;
					padding: 0.75rem;
				}
				.api-response pre {
					color: #22d3ee;
					margin: 0.5rem 0 0 0;
					overflow-x: auto;
				}
			`}</style>
		</div>
	);
}

export function AuthDemo() {
	const { isAuthenticated, authLoading } = useAuth();

	if (authLoading) {
		return <div>Loading auth state...</div>;
	}

	return (
		<div className="auth-demo">
			<h2>Auth Demo</h2>
			{isAuthenticated ? <UserProfile /> : <LoginForm />}

			<style>{`
				.auth-demo {
					margin-top: 2rem;
				}
				.auth-demo h2 {
					font-size: 1.25rem;
					font-weight: 400;
					margin: 0 0 1rem 0;
				}
			`}</style>
		</div>
	);
}
