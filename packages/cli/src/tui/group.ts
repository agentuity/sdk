/**
 * Grouped prompts orchestration
 */

type Prettify<T> = {
	[P in keyof T]: T[P];
} & {};

export type PromptGroupAwaitedReturn<T> = {
	[P in keyof T]: Exclude<Awaited<T[P]>, symbol>;
};

export type PromptGroup<T> = {
	[P in keyof T]: (opts: {
		results: Prettify<Partial<PromptGroupAwaitedReturn<Omit<T, P>>>>;
	}) => undefined | Promise<T[P] | undefined>;
};

export interface PromptGroupOptions<T> {
	onCancel?: (opts: { results: Prettify<Partial<PromptGroupAwaitedReturn<T>>> }) => void;
}

/**
 * Execute a group of prompts sequentially
 */
export async function group<T>(
	prompts: PromptGroup<T>,
	opts?: PromptGroupOptions<T>
): Promise<Prettify<PromptGroupAwaitedReturn<T>>> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const results: any = {};
	const promptNames = Object.keys(prompts);

	for (const name of promptNames) {
		const prompt = prompts[name as keyof T];
		try {
			const result = await prompt({ results });

			// Skip if undefined (conditional prompt)
			if (result === undefined) {
				continue;
			}

			results[name] = result;
		} catch (error) {
			// Handle cancellation
			if (opts?.onCancel) {
				results[name] = 'canceled';
				opts.onCancel({ results });
			}
			throw error;
		}
	}

	return results as Prettify<PromptGroupAwaitedReturn<T>>;
}
