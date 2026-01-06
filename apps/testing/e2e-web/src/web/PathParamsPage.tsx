import { useState } from 'react';
import { createAPIClient } from '@agentuity/react';

const api = createAPIClient();

export function PathParamsPage() {
	const [userId, setUserId] = useState('123');
	const [orgId, setOrgId] = useState('org-456');
	const [memberId, setMemberId] = useState('user-789');
	const [searchQuery, setSearchQuery] = useState('test');
	const [searchLimit, setSearchLimit] = useState('5');

	const [userResult, setUserResult] = useState<string>('');
	const [memberResult, setMemberResult] = useState<string>('');
	const [searchResult, setSearchResult] = useState<string>('');
	const [error, setError] = useState<string | null>(null);

	const testUserPathParam = async () => {
		try {
			setError(null);
			// Positional argument API: single path param
			const result = await api.users.userId.get(userId);
			setUserResult(JSON.stringify(result, null, 2));
		} catch (err) {
			setError(`User API Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const testMultiplePathParams = async () => {
		try {
			setError(null);
			// Positional arguments API: multiple path params in order
			const result = await api.organizations.orgId.members.memberId.get(orgId, memberId);
			setMemberResult(JSON.stringify(result, null, 2));
		} catch (err) {
			setError(`Member API Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const testQueryParams = async () => {
		try {
			setError(null);
			const result = await api.search.get({ query: { q: searchQuery, limit: searchLimit } });
			setSearchResult(JSON.stringify(result, null, 2));
		} catch (err) {
			setError(`Search API Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	return (
		<div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
			<h1>Path & Query Params Test Page</h1>
			<a href="/">← Back to Home</a>

			{error && (
				<div
					style={{
						background: '#fca5a5',
						color: '#7f1d1d',
						padding: '1rem',
						margin: '1rem 0',
						borderRadius: '0.25rem',
					}}
				>
					{error}
				</div>
			)}

			{/* Single Path Param Test */}
			<div
				style={{
					marginTop: '2rem',
					padding: '1rem',
					border: '1px solid #ccc',
					borderRadius: '0.5rem',
				}}
			>
				<h2>1. Single Path Param (/users/:userId)</h2>
				<div style={{ marginBottom: '1rem' }}>
					<label>
						User ID:{' '}
						<input
							type="text"
							value={userId}
							onChange={(e) => setUserId(e.target.value)}
							data-testid="user-id-input"
							style={{ padding: '0.5rem' }}
						/>
					</label>
				</div>
				<button
					onClick={testUserPathParam}
					data-testid="user-button"
					style={{ padding: '0.5rem 1rem' }}
				>
					Test User API
				</button>
				<pre
					data-testid="user-result"
					style={{ marginTop: '1rem', background: '#f5f5f5', padding: '1rem' }}
				>
					{userResult || 'No result yet'}
				</pre>
			</div>

			{/* Multiple Path Params Test */}
			<div
				style={{
					marginTop: '2rem',
					padding: '1rem',
					border: '1px solid #ccc',
					borderRadius: '0.5rem',
				}}
			>
				<h2>2. Multiple Path Params (/organizations/:orgId/members/:memberId)</h2>
				<div style={{ marginBottom: '1rem' }}>
					<label>
						Org ID:{' '}
						<input
							type="text"
							value={orgId}
							onChange={(e) => setOrgId(e.target.value)}
							data-testid="org-id-input"
							style={{ padding: '0.5rem', marginRight: '1rem' }}
						/>
					</label>
					<label>
						Member ID:{' '}
						<input
							type="text"
							value={memberId}
							onChange={(e) => setMemberId(e.target.value)}
							data-testid="member-id-input"
							style={{ padding: '0.5rem' }}
						/>
					</label>
				</div>
				<button
					onClick={testMultiplePathParams}
					data-testid="member-button"
					style={{ padding: '0.5rem 1rem' }}
				>
					Test Member API
				</button>
				<pre
					data-testid="member-result"
					style={{ marginTop: '1rem', background: '#f5f5f5', padding: '1rem' }}
				>
					{memberResult || 'No result yet'}
				</pre>
			</div>

			{/* Query Params Test */}
			<div
				style={{
					marginTop: '2rem',
					padding: '1rem',
					border: '1px solid #ccc',
					borderRadius: '0.5rem',
				}}
			>
				<h2>3. Query Params (/search?q=...&limit=...)</h2>
				<div style={{ marginBottom: '1rem' }}>
					<label>
						Query:{' '}
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							data-testid="search-query-input"
							style={{ padding: '0.5rem', marginRight: '1rem' }}
						/>
					</label>
					<label>
						Limit:{' '}
						<input
							type="text"
							value={searchLimit}
							onChange={(e) => setSearchLimit(e.target.value)}
							data-testid="search-limit-input"
							style={{ padding: '0.5rem' }}
						/>
					</label>
				</div>
				<button
					onClick={testQueryParams}
					data-testid="search-button"
					style={{ padding: '0.5rem 1rem' }}
				>
					Test Search API
				</button>
				<pre
					data-testid="search-result"
					style={{ marginTop: '1rem', background: '#f5f5f5', padding: '1rem' }}
				>
					{searchResult || 'No result yet'}
				</pre>
			</div>
		</div>
	);
}
