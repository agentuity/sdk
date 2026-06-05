import { setTimeout as sleep } from 'node:timers/promises';
import { StructuredError } from '@agentuity/core';
import { APIResponseSchema, APIResponseSchemaOptionalData } from '@agentuity/server';
import { z } from 'zod';
import type { APIClient } from '../../api.ts';

// Zod schemas for API validation
const CodeStartDataSchema = z.object({
	code: z.string(),
});

const CodeCompleteDataSchema = z.object({
	apiKey: z.string(),
	userId: z.string(),
	expires: z.number(),
});

const CodeCheckRequestSchema = z.object({
	code: z.string(),
});

// Exported result types
export interface LoginResult {
	apiKey: string;
	userId: string;
	expires: Date;
}

const CodeGenerationError = StructuredError(
	'CodeGenerationError',
	'Error generating the login code'
);

export async function generateLoginCode(apiClient: APIClient): Promise<string> {
	const resp = await apiClient.get('/cli/auth/start', APIResponseSchema(CodeStartDataSchema));

	if (!resp.success) {
		throw new CodeGenerationError();
	}

	if (!resp.data) {
		throw new CodeGenerationError();
	}

	return resp.data.code;
}

const PollForLoginError = StructuredError('PollForLoginError');
const PollForLoginTimeout = StructuredError(
	'PollForLoginTimeout',
	'Timed out waiting for user login. Aborting'
);

export async function pollForLoginCompletion(
	apiClient: APIClient,
	code: string,
	timeoutMs = 300000 // 5 minutes
): Promise<LoginResult> {
	const started = Date.now();

	while (Date.now() - started < timeoutMs) {
		const resp = await apiClient.post(
			'/cli/auth/check',
			{ code },
			APIResponseSchemaOptionalData(CodeCompleteDataSchema),
			CodeCheckRequestSchema
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

		await sleep(2000);
	}

	throw new PollForLoginTimeout();
}
