import { describe, test, expect } from 'bun:test';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AgentuityProvider, useAuth, useAgentuity } from '../src/context';

describe('useAuth', () => {
	test('useAuth is exported and is a function', () => {
		expect(typeof useAuth).toBe('function');
	});

	test('useAgentuity is still exported and is a function', () => {
		expect(typeof useAgentuity).toBe('function');
	});

	test('useAuth returns only auth-specific properties', () => {
		function TestComponent() {
			const auth = useAuth();
			return (
				<div>
					<div data-testid="has-base-url">{String('baseUrl' in auth)}</div>
					<div data-testid="has-auth-header">{String('authHeader' in auth)}</div>
					<div data-testid="has-auth-loading">{String('authLoading' in auth)}</div>
					<div data-testid="has-is-authenticated">{String('isAuthenticated' in auth)}</div>
					<div data-testid="is-authenticated">{String(auth.isAuthenticated)}</div>
				</div>
			);
		}

		render(
			<AgentuityProvider baseUrl="http://localhost:3000">
				<TestComponent />
			</AgentuityProvider>
		);

		// useAuth should NOT have baseUrl
		expect(screen.getByTestId('has-base-url').textContent).toBe('false');
		// But should have auth-specific props
		expect(screen.getByTestId('has-auth-header').textContent).toBe('true');
		expect(screen.getByTestId('has-auth-loading').textContent).toBe('true');
		expect(screen.getByTestId('has-is-authenticated').textContent).toBe('true');
		expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
	});

	test('useAgentuity returns ONLY baseUrl (no auth properties)', () => {
		function TestComponent() {
			const context = useAgentuity();
			return (
				<div>
					<div data-testid="base-url">{context.baseUrl}</div>
					<div data-testid="has-auth-header">{String('authHeader' in context)}</div>
					<div data-testid="has-is-authenticated">{String('isAuthenticated' in context)}</div>
				</div>
			);
		}

		render(
			<AgentuityProvider baseUrl="http://localhost:3000">
				<TestComponent />
			</AgentuityProvider>
		);

		// useAgentuity should ONLY have baseUrl
		expect(screen.getByTestId('base-url').textContent).toBe('http://localhost:3000');
		// And should NOT have auth properties
		expect(screen.getByTestId('has-auth-header').textContent).toBe('false');
		expect(screen.getByTestId('has-is-authenticated').textContent).toBe('false');
	});

	test('isAuthenticated is false when authHeader is null', () => {
		function TestComponent() {
			const { isAuthenticated } = useAuth();
			return <div data-testid="authenticated">{String(isAuthenticated)}</div>;
		}

		render(
			<AgentuityProvider>
				<TestComponent />
			</AgentuityProvider>
		);

		expect(screen.getByTestId('authenticated').textContent).toBe('false');
	});

	test('isAuthenticated is false when authLoading is true', () => {
		function TestComponent() {
			const { setAuthLoading, setAuthHeader, isAuthenticated } = useAuth();

			// Set loading and header in effect
			React.useEffect(() => {
				setAuthLoading?.(true);
				setAuthHeader?.('Bearer token');
			}, [setAuthLoading, setAuthHeader]);

			return <div data-testid="authenticated">{String(isAuthenticated)}</div>;
		}

		render(
			<AgentuityProvider>
				<TestComponent />
			</AgentuityProvider>
		);

		// Should be false because loading is true
		expect(screen.getByTestId('authenticated').textContent).toBe('false');
	});

	test('isAuthenticated is true when authHeader is set and not loading', async () => {
		function TestComponent() {
			const { setAuthLoading, setAuthHeader, isAuthenticated } = useAuth();

			// Set auth header and stop loading
			React.useEffect(() => {
				setAuthHeader?.('Bearer token');
				setAuthLoading?.(false);
			}, [setAuthLoading, setAuthHeader]);

			return <div data-testid="authenticated">{String(isAuthenticated)}</div>;
		}

		render(
			<AgentuityProvider>
				<TestComponent />
			</AgentuityProvider>
		);

		// Wait for effect to run and set auth state to true
		await waitFor(() => {
			expect(screen.getByTestId('authenticated').textContent).toBe('true');
		});
	});

	test('provides setAuthHeader and setAuthLoading functions', () => {
		function TestComponent() {
			const { setAuthHeader, setAuthLoading } = useAuth();
			return (
				<div>
					<div data-testid="has-set-auth-header">
						{String(typeof setAuthHeader === 'function')}
					</div>
					<div data-testid="has-set-auth-loading">
						{String(typeof setAuthLoading === 'function')}
					</div>
				</div>
			);
		}

		render(
			<AgentuityProvider>
				<TestComponent />
			</AgentuityProvider>
		);

		expect(screen.getByTestId('has-set-auth-header').textContent).toBe('true');
		expect(screen.getByTestId('has-set-auth-loading').textContent).toBe('true');
	});
});
