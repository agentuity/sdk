/**
 * Auth Demo Components
 *
 * Visual UI for testing BetterAuth integration including:
 * - Login/Signup
 * - User Profile
 * - API Key Management
 * - Organization Management
 */

import { useState, type FormEvent } from 'react';
import { authClient, useSession } from './auth-client';
import { useAPI, useAuth } from '@agentuity/react';
import React from 'react';

// =============================================================================
// Shared Styles
// =============================================================================

const cardStyle = `
	background: #18181b;
	border: 1px solid #27272a;
	border-radius: 0.5rem;
	padding: 1.5rem;
	margin-bottom: 1rem;
`;

const buttonStyle = `
	background: #27272a;
	border: 1px solid #3f3f46;
	border-radius: 0.375rem;
	color: #fff;
	cursor: pointer;
	padding: 0.5rem 1rem;
	font-size: 0.75rem;
`;

const inputStyle = `
	background: #09090b;
	border: 1px solid #3f3f46;
	border-radius: 0.375rem;
	color: #fff;
	padding: 0.5rem 0.75rem;
	font-size: 0.875rem;
	width: 100%;
`;

// =============================================================================
// Login Form
// =============================================================================

export function LoginForm() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [mode, setMode] = useState<'signin' | 'signup'>('signin');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result =
				mode === 'signin'
					? await authClient.signIn.email({ email, password })
					: await authClient.signUp.email({
						email,
						password,
						name: email.split('@')[0] ?? 'User',
					});

			if (result.error) {
				setError(result.error.message || `Sign ${mode === 'signin' ? 'in' : 'up'} failed`);
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
					${cardStyle}
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
					${inputStyle}
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

// =============================================================================
// User Profile
// =============================================================================

export function UserProfile() {
	const { data: session, isPending } = useSession();
	const { isAuthenticated } = useAuth();
	const { data: meData, refetch } = useAPI('GET /api/me');

	const userData = meData as
		| { id?: string; name?: string; email?: string; authMethod?: string }
		| undefined;

	const handleSignOut = async () => {
		await authClient.signOut();
		window.location.reload();
	};

	if (isPending) {
		return <div className="profile">Loading session...</div>;
	}

	if (!session?.user && !isAuthenticated) {
		return null;
	}

	return (
		<div className="profile">
			<h3>👤 User Profile</h3>

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
				{userData?.authMethod && (
					<p>
						<strong>Auth Method:</strong> {userData.authMethod}
					</p>
				)}
			</div>

			<div className="profile-actions">
				<button onClick={() => refetch()}>Test /api/me</button>
				<button onClick={handleSignOut} className="signout">
					Sign Out
				</button>
			</div>

			<style>{`
				.profile {
					${cardStyle}
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
					${buttonStyle}
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
			`}</style>
		</div>
	);
}

// =============================================================================
// API Key Management
// =============================================================================

interface ApiKey {
	id: string;
	name: string;
	start?: string;
	key?: string;
	expiresAt?: string;
	createdAt?: string;
}

export function ApiKeyManager() {
	const [newKeyName, setNewKeyName] = useState('');
	const [createdKey, setCreatedKey] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const {
		data: apiKeys,
		refetch: refetchKeys,
		isLoading: loadingKeys,
	} = useAPI('GET /api/api-keys');
	const { invoke: createKey, isLoading: creating } = useAPI('POST /api/api-keys');

	const handleCreateKey = async () => {
		setError(null);
		setCreatedKey(null);

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = (await (createKey as any)({ name: newKeyName || 'default-key' })) as ApiKey;
			if (result?.key) {
				setCreatedKey(result.key);
				setNewKeyName('');
				refetchKeys();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create API key');
		}
	};

	const handleDeleteKey = async (keyId: string) => {
		setError(null);

		try {
			await fetch(`/api/api-keys/${keyId}`, { method: 'DELETE', credentials: 'include' });
			refetchKeys();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to delete API key');
		}
	};

	const keys = (apiKeys as unknown as ApiKey[]) || [];

	return (
		<div className="api-keys">
			<h3>API Keys</h3>

			<div className="create-key">
				<input
					type="text"
					placeholder="Key name (optional)"
					value={newKeyName}
					onChange={(e) => setNewKeyName(e.target.value)}
					disabled={creating}
				/>
				<button onClick={handleCreateKey} disabled={creating}>
					{creating ? 'Creating...' : 'Create API Key'}
				</button>
			</div>

			{createdKey && (
				<div className="new-key-alert">
					<strong>⚠️ Save this key - it won't be shown again!</strong>
					<code>{createdKey}</code>
					<button onClick={() => navigator.clipboard.writeText(createdKey)}>Copy</button>
				</div>
			)}

			{error && <div className="error">{error}</div>}

			<div className="keys-list">
				<h4>Your API Keys</h4>
				{loadingKeys ? (
					<p>Loading...</p>
				) : keys.length === 0 ? (
					<p className="no-keys">No API keys yet</p>
				) : (
					<ul>
						{keys.map((key) => (
							<li key={key.id}>
								<span className="key-info">
									<strong>{key.name}</strong>
									<code>{key.start}...</code>
								</span>
								<button className="delete" onClick={() => handleDeleteKey(key.id)}>
									Delete
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			<style>{`
				.api-keys {
					${cardStyle}
				}
				.api-keys h3 {
					margin: 0 0 1rem 0;
					font-weight: 500;
				}
				.api-keys h4 {
					margin: 1rem 0 0.5rem 0;
					font-size: 0.875rem;
					font-weight: 500;
					color: #a1a1aa;
				}
				.create-key {
					display: flex;
					gap: 0.5rem;
				}
				.create-key input {
					${inputStyle}
					flex: 1;
				}
				.create-key button {
					${buttonStyle}
					background: linear-gradient(to right, #155e75, #3b82f6);
					white-space: nowrap;
				}
				.new-key-alert {
					background: #14532d;
					border: 1px solid #22c55e;
					border-radius: 0.375rem;
					color: #86efac;
					font-size: 0.75rem;
					margin-top: 0.75rem;
					padding: 0.75rem;
				}
				.new-key-alert strong {
					display: block;
					margin-bottom: 0.5rem;
				}
				.new-key-alert code {
					display: block;
					background: #09090b;
					padding: 0.5rem;
					border-radius: 0.25rem;
					word-break: break-all;
					margin-bottom: 0.5rem;
				}
				.new-key-alert button {
					${buttonStyle}
					font-size: 0.7rem;
					padding: 0.25rem 0.5rem;
				}
				.error {
					background: #450a0a;
					border: 1px solid #dc2626;
					border-radius: 0.375rem;
					color: #fca5a5;
					font-size: 0.75rem;
					margin-top: 0.75rem;
					padding: 0.5rem;
				}
				.keys-list ul {
					list-style: none;
					padding: 0;
					margin: 0;
				}
				.keys-list li {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 0.5rem;
					background: #09090b;
					border-radius: 0.25rem;
					margin-bottom: 0.25rem;
				}
				.key-info {
					display: flex;
					flex-direction: column;
					gap: 0.25rem;
				}
				.key-info code {
					color: #71717a;
					font-size: 0.75rem;
				}
				.keys-list .delete {
					${buttonStyle}
					background: #450a0a;
					border-color: #dc2626;
					font-size: 0.7rem;
					padding: 0.25rem 0.5rem;
				}
				.no-keys {
					color: #71717a;
					font-size: 0.875rem;
				}
			`}</style>
		</div>
	);
}

// =============================================================================
// Organization Management
// =============================================================================

interface Organization {
	id: string;
	name: string;
	slug: string;
	logo?: string;
}

export function OrganizationManager() {
	const [newOrgName, setNewOrgName] = useState('');
	const [newOrgSlug, setNewOrgSlug] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const {
		data: orgs,
		refetch: refetchOrgs,
		isLoading: loadingOrgs,
	} = useAPI('GET /api/organizations');
	const { data: activeOrg, refetch: refetchActive } = useAPI('GET /api/organizations/active');
	const { invoke: createOrg, isLoading: creating } = useAPI('POST /api/organizations');
	const { data: whoami, refetch: refetchWhoami } = useAPI('GET /api/whoami');

	const organizations = (orgs as unknown as Organization[]) || [];
	const activeOrgData = activeOrg as unknown as Organization | { message?: string } | undefined;
	const whoamiData = whoami as unknown as {
		user?: { id: string; name: string; email: string };
		organization?: { id: string; name: string; slug: string; role?: string } | null;
	};

	const handleCreateOrg = async () => {
		setError(null);
		setSuccess(null);

		if (!newOrgName || !newOrgSlug) {
			setError('Name and slug are required');
			return;
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (createOrg as any)({ name: newOrgName, slug: newOrgSlug });
			setSuccess(`Organization "${newOrgName}" created!`);
			setNewOrgName('');
			setNewOrgSlug('');
			refetchOrgs();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create organization');
		}
	};

	const handleActivateOrg = async (orgId: string) => {
		setError(null);
		setSuccess(null);

		try {
			await fetch(`/api/organizations/${orgId}/activate`, {
				method: 'POST',
				credentials: 'include',
			});
			refetchActive();
			refetchWhoami();
			setSuccess('Organization activated!');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to activate organization');
		}
	};

	return (
		<div className="organizations">
			<h3>🏢 Organizations</h3>

			{/* Who Am I */}
			{whoamiData && (
				<div className="whoami">
					<h4>Current Context</h4>
					<p>
						<strong>User:</strong> {whoamiData.user?.email}
					</p>
					{whoamiData.organization ? (
						<p>
							<strong>Active Org:</strong> {whoamiData.organization.name} (
							{whoamiData.organization.role})
						</p>
					) : (
						<p>
							<strong>Active Org:</strong> None
						</p>
					)}
					<button onClick={() => refetchWhoami()}>Refresh</button>
				</div>
			)}

			{/* Create Organization */}
			<div className="create-org">
				<h4>Create Organization</h4>
				<div className="form-row">
					<input
						type="text"
						placeholder="Organization name"
						value={newOrgName}
						onChange={(e) => {
							setNewOrgName(e.target.value);
							setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
						}}
						disabled={creating}
					/>
					<input
						type="text"
						placeholder="Slug"
						value={newOrgSlug}
						onChange={(e) => setNewOrgSlug(e.target.value)}
						disabled={creating}
					/>
				</div>
				<button onClick={handleCreateOrg} disabled={creating}>
					{creating ? 'Creating...' : 'Create Organization'}
				</button>
			</div>

			{error && <div className="error">{error}</div>}
			{success && <div className="success">{success}</div>}

			{/* Organizations List */}
			<div className="orgs-list">
				<h4>Your Organizations</h4>
				{loadingOrgs ? (
					<p>Loading...</p>
				) : organizations.length === 0 ? (
					<p className="no-orgs">No organizations yet</p>
				) : (
					<ul>
						{organizations.map((org) => (
							<li
								key={org.id}
								className={
									activeOrgData && 'id' in activeOrgData && activeOrgData.id === org.id
										? 'active'
										: ''
								}
							>
								<span className="org-info">
									<strong>{org.name}</strong>
									<code>{org.slug}</code>
								</span>
								<button onClick={() => handleActivateOrg(org.id)}>
									{activeOrgData && 'id' in activeOrgData && activeOrgData.id === org.id
										? '✓ Active'
										: 'Activate'}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			<style>{`
				.organizations {
					${cardStyle}
				}
				.organizations h3 {
					margin: 0 0 1rem 0;
					font-weight: 500;
				}
				.organizations h4 {
					margin: 1rem 0 0.5rem 0;
					font-size: 0.875rem;
					font-weight: 500;
					color: #a1a1aa;
				}
				.whoami {
					background: #09090b;
					border-radius: 0.375rem;
					padding: 0.75rem;
					margin-bottom: 1rem;
				}
				.whoami h4 {
					margin-top: 0;
				}
				.whoami p {
					margin: 0.25rem 0;
					font-size: 0.875rem;
				}
				.whoami button {
					${buttonStyle}
					margin-top: 0.5rem;
					font-size: 0.7rem;
				}
				.create-org .form-row {
					display: flex;
					gap: 0.5rem;
					margin-bottom: 0.5rem;
				}
				.create-org input {
					${inputStyle}
					flex: 1;
				}
				.create-org button {
					${buttonStyle}
					background: linear-gradient(to right, #155e75, #3b82f6);
				}
				.error {
					background: #450a0a;
					border: 1px solid #dc2626;
					border-radius: 0.375rem;
					color: #fca5a5;
					font-size: 0.75rem;
					margin-top: 0.75rem;
					padding: 0.5rem;
				}
				.success {
					background: #14532d;
					border: 1px solid #22c55e;
					border-radius: 0.375rem;
					color: #86efac;
					font-size: 0.75rem;
					margin-top: 0.75rem;
					padding: 0.5rem;
				}
				.orgs-list ul {
					list-style: none;
					padding: 0;
					margin: 0;
				}
				.orgs-list li {
					display: flex;
					justify-content: space-between;
					align-items: center;
					padding: 0.5rem;
					background: #09090b;
					border-radius: 0.25rem;
					margin-bottom: 0.25rem;
				}
				.orgs-list li.active {
					border: 1px solid #22c55e;
				}
				.org-info {
					display: flex;
					flex-direction: column;
					gap: 0.25rem;
				}
				.org-info code {
					color: #71717a;
					font-size: 0.75rem;
				}
				.orgs-list button {
					${buttonStyle}
					font-size: 0.7rem;
					padding: 0.25rem 0.5rem;
				}
				.no-orgs {
					color: #71717a;
					font-size: 0.875rem;
				}
			`}</style>
		</div>
	);
}

// =============================================================================
// JWT Token Display
// =============================================================================

export function JwtTokenDisplay() {
	const { data: jwtData, refetch, isLoading } = useAPI('GET /api/jwt');
	const [copied, setCopied] = useState(false);

	const jwt = jwtData as { token?: string; jwksUrl?: string; usage?: string } | undefined;

	const handleCopy = () => {
		if (jwt?.token) {
			navigator.clipboard.writeText(jwt.token);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<div className="jwt-display">
			<h3>🎫 JWT Token</h3>

			<button onClick={() => refetch()} disabled={isLoading}>
				{isLoading ? 'Loading...' : 'Get JWT Token'}
			</button>

			{jwt?.token && (
				<div className="token-display">
					<code>{jwt.token.slice(0, 50)}...</code>
					<button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy Full Token'}</button>
				</div>
			)}

			{jwt?.jwksUrl && (
				<p className="jwks-url">
					JWKS URL:{' '}
					<a href={jwt.jwksUrl} target="_blank" rel="noopener noreferrer">
						{jwt.jwksUrl}
					</a>
				</p>
			)}

			<style>{`
				.jwt-display {
					${cardStyle}
				}
				.jwt-display h3 {
					margin: 0 0 1rem 0;
					font-weight: 500;
				}
				.jwt-display > button {
					${buttonStyle}
					background: linear-gradient(to right, #155e75, #3b82f6);
				}
				.token-display {
					margin-top: 0.75rem;
					background: #09090b;
					border-radius: 0.375rem;
					padding: 0.75rem;
				}
				.token-display code {
					display: block;
					word-break: break-all;
					margin-bottom: 0.5rem;
					color: #22d3ee;
				}
				.token-display button {
					${buttonStyle}
					font-size: 0.7rem;
				}
				.jwks-url {
					margin-top: 0.5rem;
					font-size: 0.75rem;
					color: #71717a;
				}
				.jwks-url a {
					color: #3b82f6;
				}
			`}</style>
		</div>
	);
}

// =============================================================================
// Main Auth Demo Component
// =============================================================================

export function AuthDemo() {
	const { data: session, isPending } = useSession();
	const { isAuthenticated, authLoading } = useAuth();

	if (isPending || authLoading) {
		return <div>Loading auth state...</div>;
	}

	const hasSession = !!session?.user || isAuthenticated;

	return (
		<div className="auth-demo">
			<h2>🔐 Auth Demo</h2>
			<p className="subtitle">
				Test BetterAuth integration with API Keys, JWT, and Organizations
			</p>

			{hasSession ? (
				<div className="auth-sections">
					<div className="section-row">
						<UserProfile />
						<JwtTokenDisplay />
					</div>
					<div className="section-row">
						<ApiKeyManager />
						<OrganizationManager />
					</div>
				</div>
			) : (
				<LoginForm />
			)}

			<style>{`
				.auth-demo {
					margin-top: 2rem;
				}
				.auth-demo h2 {
					font-size: 1.5rem;
					font-weight: 500;
					margin: 0 0 0.5rem 0;
				}
				.auth-demo .subtitle {
					color: #71717a;
					margin: 0 0 1.5rem 0;
				}
				.auth-sections {
					display: flex;
					flex-direction: column;
					gap: 1rem;
				}
				.section-row {
					display: grid;
					grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
					gap: 1rem;
				}
			`}</style>
		</div>
	);
}
