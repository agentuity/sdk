/**
 * Root Route - TanStack Router
 *
 * This is the root layout component that wraps all routes.
 * It provides the navigation structure and renders child routes via <Outlet />.
 */

import { Link, Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<div className="app-container">
			<nav className="nav">
				<Link to="/" className="nav-link" activeProps={{ className: 'nav-link active' }}>
					Home
				</Link>
				<Link to="/about" className="nav-link" activeProps={{ className: 'nav-link active' }}>
					About
				</Link>
				<Link to="/hello" className="nav-link" activeProps={{ className: 'nav-link active' }}>
					Hello Agent
				</Link>
			</nav>
			<main className="main">
				<Outlet />
			</main>
			<style>
				{`
					body {
						margin: 0;
						background-color: #09090b;
					}

					.app-container {
						background-color: #09090b;
						color: #fff;
						font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
						min-height: 100vh;
					}

					.nav {
						display: flex;
						gap: 1rem;
						padding: 1rem 2rem;
						background: #000;
						border-bottom: 1px solid #18181b;
					}

					.nav-link {
						color: #a1a1aa;
						text-decoration: none;
						padding: 0.5rem 1rem;
						border-radius: 0.375rem;
						transition: all 0.2s;
					}

					.nav-link:hover {
						color: #fff;
						background: #18181b;
					}

					.nav-link.active {
						color: #22d3ee;
						background: #164e63;
					}

					.main {
						max-width: 48rem;
						margin: 0 auto;
						padding: 2rem;
					}
				`}
			</style>
		</div>
	);
}
