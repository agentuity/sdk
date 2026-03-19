import { useState, useEffect } from 'react';

type UserInfo = Record<string, unknown>;

interface OAuthState {
	loading: boolean;
	loggedIn: boolean;
	user: UserInfo | null;
	loginUrl: string | null;
	error: string | null;
}

export function App() {
	const [state, setState] = useState<OAuthState>({
		loading: true,
		loggedIn: false,
		user: null,
		loginUrl: null,
		error: null,
	});

	useEffect(() => {
		fetch('/api/oauth/me')
			.then((res) => res.json())
			.then((data) => {
				if (data.loggedIn) {
					setState({
						loading: false,
						loggedIn: true,
						user: data.user,
						loginUrl: null,
						error: null,
					});
				} else {
					setState({
						loading: false,
						loggedIn: false,
						user: null,
						loginUrl: data.loginUrl,
						error: null,
					});
				}
			})
			.catch((err) => {
				setState({
					loading: false,
					loggedIn: false,
					user: null,
					loginUrl: null,
					error: String(err),
				});
			});
	}, []);

	return (
		<div style={styles.container}>
			<div style={styles.card}>
				<h1 style={styles.title}>
					<span style={styles.accent}>Agentuity</span> OAuth Demo
				</h1>

				{state.loading && <p style={styles.text}>Loading...</p>}

				{state.error && (
					<div style={styles.errorBox}>
						<p style={styles.errorText}>Error: {state.error}</p>
					</div>
				)}

				{!state.loading && !state.loggedIn && state.loginUrl && (
					<div style={styles.section}>
						<p style={styles.text}>You are not logged in.</p>
						<a href={state.loginUrl} style={styles.button}>
							Login with OAuth
						</a>
					</div>
				)}

				{!state.loading && state.loggedIn && state.user && (
					<div style={styles.section}>
						<p style={styles.text}>You are logged in!</p>
						<div style={styles.userInfo}>
							<h3 style={styles.subtitle}>User Info</h3>
							<pre style={styles.pre}>{JSON.stringify(state.user, null, 2)}</pre>
						</div>
						<a href="/api/oauth/logout" style={{ ...styles.button, ...styles.logoutButton }}>
							Logout
						</a>
					</div>
				)}
			</div>
		</div>
	);
}

const styles: Record<string, React.CSSProperties> = {
	container: {
		minHeight: '100vh',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#09090b',
		fontFamily: 'system-ui, -apple-system, sans-serif',
		padding: '1rem',
	},
	card: {
		backgroundColor: '#18181b',
		borderRadius: '12px',
		border: '1px solid #27272a',
		padding: '2.5rem',
		maxWidth: '480px',
		width: '100%',
		textAlign: 'center' as const,
	},
	title: {
		color: '#fafafa',
		fontSize: '1.5rem',
		fontWeight: 600,
		marginBottom: '1.5rem',
	},
	accent: {
		color: '#00FFFF',
	},
	text: {
		color: '#a1a1aa',
		fontSize: '1rem',
		marginBottom: '1rem',
	},
	section: {
		display: 'flex',
		flexDirection: 'column' as const,
		alignItems: 'center',
		gap: '1rem',
	},
	button: {
		display: 'inline-block',
		backgroundColor: '#00FFFF',
		color: '#09090b',
		padding: '0.75rem 1.5rem',
		borderRadius: '8px',
		fontWeight: 600,
		fontSize: '0.95rem',
		textDecoration: 'none',
		transition: 'opacity 0.2s',
		cursor: 'pointer',
	},
	logoutButton: {
		backgroundColor: '#3f3f46',
		color: '#fafafa',
		marginTop: '0.5rem',
	},
	subtitle: {
		color: '#fafafa',
		fontSize: '1.1rem',
		fontWeight: 500,
		marginBottom: '0.5rem',
	},
	userInfo: {
		width: '100%',
		textAlign: 'left' as const,
	},
	pre: {
		backgroundColor: '#09090b',
		border: '1px solid #27272a',
		borderRadius: '8px',
		padding: '1rem',
		color: '#00FFFF',
		fontSize: '0.85rem',
		overflow: 'auto',
		maxHeight: '300px',
	},
	errorBox: {
		backgroundColor: '#2d1215',
		border: '1px solid #7f1d1d',
		borderRadius: '8px',
		padding: '1rem',
		marginBottom: '1rem',
	},
	errorText: {
		color: '#fca5a5',
		margin: 0,
	},
};
