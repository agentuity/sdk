import { z } from 'zod';
import { APIError, APIResponseSchema, APIResponseSchemaOptionalData } from '@agentuity/server';
import type { APIClient } from '../../api';
import { StructuredError } from '@agentuity/core';

// Zod schemas for API validation
const OTPStartDataSchema = z.object({
	otp: z.string(),
});

const OTPCompleteDataSchema = z.object({
	apiKey: z.string(),
	userId: z.string(),
	expires: z.number(),
});

const SignupCompleteDataSchema = z.object({
	userId: z.string(),
	apiKey: z.string(),
	expiresAt: z.number(),
});

const OTPCheckRequestSchema = z.object({
	otp: z.string(),
});

// Exported result types
export interface LoginResult {
	apiKey: string;
	userId: string;
	expires: Date;
}

export interface SignupResult {
	apiKey: string;
	userId: string;
	expires: Date;
}

const OTPGenerationError = StructuredError(
	'OTPGenerationError',
	'Error generating the one-time login code'
);

export async function generateLoginOTP(apiClient: APIClient): Promise<string> {
	const resp = await apiClient.get('/cli/auth/start', APIResponseSchema(OTPStartDataSchema));

	if (!resp.success) {
		throw new OTPGenerationError();
	}

	if (!resp.data) {
		throw new OTPGenerationError();
	}

	return resp.data.otp;
}

const PollForLoginError = StructuredError('PollForLoginError');
const PollForLoginTimeout = StructuredError(
	'PollForLoginTimeout',
	'Timed out waiting for user login. Aborting'
);

export async function pollForLoginCompletion(
	apiClient: APIClient,
	otp: string,
	timeoutMs = 60000
): Promise<LoginResult> {
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		const resp = await apiClient.request(
			'POST',
			'/cli/auth/check',
			APIResponseSchemaOptionalData(OTPCompleteDataSchema),
			{ otp },
			OTPCheckRequestSchema
		);

		if (!resp.success) {
			throw new PollForLoginError({ message: resp.message });
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

	throw new PollForLoginTimeout();
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

const PollForSignupCompletedError = StructuredError(
	'PollForSignupCompletedError',
	'Error waiting for signup completion. Please try again.'
);

const PollForSignupTimeoutError = StructuredError(
	'PollForSignupTimeoutError',
	'Timed out waiting for user signup. Aborting.'
);

export async function pollForSignupCompletion(
	apiClient: APIClient,
	otp: string,
	timeoutMs = 350000
): Promise<SignupResult> {
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		try {
			const resp = await apiClient.request(
				'GET',
				`/cli/auth/signup/${otp}`,
				APIResponseSchema(SignupCompleteDataSchema)
			);

			if (!resp.success) {
				throw new PollForSignupCompletedError();
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

	throw new PollForSignupTimeoutError();
}
