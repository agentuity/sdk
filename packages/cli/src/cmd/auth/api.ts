import { APIClient, APIError } from '../../api';
import type { Config } from '../../types';

interface APIResponse<T> {
	success: boolean;
	message: string;
	data?: T;
}

interface OTPStartData {
	otp: string;
}

interface OTPCompleteData {
	apiKey: string;
	userId: string;
	expires: number;
}

export interface LoginResult {
	apiKey: string;
	userId: string;
	expires: Date;
}

interface SignupCompleteData {
	userId: string;
	apiKey: string;
	expiresAt: number;
}

export interface SignupResult {
	apiKey: string;
	userId: string;
	expires: Date;
}

export async function generateLoginOTP(apiUrl: string, config?: Config | null): Promise<string> {
	const client = new APIClient(apiUrl, undefined, config);
	const resp = await client.request<APIResponse<OTPStartData>>('GET', '/cli/auth/start');

	if (!resp.success) {
		throw new Error(resp.message);
	}

	if (!resp.data) {
		throw new Error('No OTP returned from server');
	}

	return resp.data.otp;
}

export async function pollForLoginCompletion(
	apiUrl: string,
	otp: string,
	config?: Config | null,
	timeoutMs = 60000
): Promise<LoginResult> {
	const client = new APIClient(apiUrl, undefined, config);
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		const resp = await client.request<APIResponse<OTPCompleteData>>('POST', '/cli/auth/check', {
			otp,
		});

		if (!resp.success) {
			throw new Error(resp.message);
		}

		if (resp.data) {
			return {
				apiKey: resp.data.apiKey,
				userId: resp.data.userId,
				expires: new Date(resp.data.expires),
			};
		}

		await Bun.sleep(2000);
	}

	throw new Error('Login timed out');
}

export function generateSignupOTP(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	let result = '';
	const array = new Uint8Array(5);
	crypto.getRandomValues(array);
	for (let i = 0; i < 5; i++) {
		result += chars[array[i] % chars.length];
	}
	return result;
}

export async function pollForSignupCompletion(
	apiUrl: string,
	otp: string,
	config?: Config | null,
	timeoutMs = 300000
): Promise<SignupResult> {
	const client = new APIClient(apiUrl, undefined, config);
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		try {
			const resp = await client.request<APIResponse<SignupCompleteData>>(
				'GET',
				`/cli/auth/signup/${otp}`
			);

			if (!resp.success) {
				throw new Error(resp.message);
			}

			if (resp.data) {
				return {
					apiKey: resp.data.apiKey,
					userId: resp.data.userId,
					expires: new Date(resp.data.expiresAt),
				};
			}
		} catch (error) {
			if (error instanceof APIError && error.status === 404) {
				await Bun.sleep(2000);
				continue;
			}
			throw error;
		}

		await Bun.sleep(2000);
	}

	throw new Error('Signup timed out');
}
