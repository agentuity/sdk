/**
 * HTTP Client Helper
 *
 * Provides HTTP client with cookie jar for testing state persistence.
 */

/**
 * Simple cookie jar for storing and sending cookies
 */
export class CookieJar {
	private cookies: Map<string, string> = new Map();

	/**
	 * Parse and store a Set-Cookie header
	 */
	setCookie(cookieHeader: string) {
		// Parse cookie: "name=value; Path=/; ..."
		const parts = cookieHeader.split(';');
		const nameValue = parts[0];
		
		// Split only on first '=' to preserve '=' in cookie value
		const equalIndex = nameValue.indexOf('=');
		if (equalIndex === -1) {
			return;
		}
		
		const name = nameValue.slice(0, equalIndex).trim();
		const value = nameValue.slice(equalIndex + 1).trim();

		if (name && value !== undefined) {
			this.cookies.set(name, value);
		}
	}

	/**
	 * Get Cookie header value for request
	 */
	getCookieHeader(): string {
		return Array.from(this.cookies.entries())
			.map(([name, value]) => `${name}=${value}`)
			.join('; ');
	}

	/**
	 * Get specific cookie value
	 */
	getCookie(name: string): string | undefined {
		return this.cookies.get(name);
	}

	/**
	 * Clear all cookies
	 */
	clear() {
		this.cookies.clear();
	}

	/**
	 * Get all cookies
	 */
	getAll(): Map<string, string> {
		return new Map(this.cookies);
	}
}

/**
 * Make HTTP request and store cookies in jar
 */
export async function httpRequest(
	url: string,
	options: RequestInit,
	jar?: CookieJar
): Promise<Response> {
	// Add cookies from jar if provided
	if (jar && jar.getCookieHeader()) {
		options.headers = {
			...options.headers,
			Cookie: jar.getCookieHeader(),
		};
	}

	// Make request
	const response = await fetch(url, options);

	// Store cookies from response
	if (jar) {
		const setCookies = response.headers.getSetCookie();
		for (const cookie of setCookies) {
			jar.setCookie(cookie);
		}
	}

	return response;
}

/**
 * Extract session ID from response headers
 */
export function getSessionId(response: Response): string | null {
	return response.headers.get('x-session-id');
}

/**
 * Extract thread ID from cookie jar (atid cookie)
 */
export function getThreadId(jar: CookieJar): string | null {
	const threadId = jar.getCookie('atid');
	return threadId || null;
}
