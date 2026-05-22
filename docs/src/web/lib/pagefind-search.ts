const PAGEFIND_RESULT_LIMIT = 12;
const PAGEFIND_MODULE_PATH = '/pagefind/pagefind.js';

const QUERY_ALIASES = {
	db: 'database Postgres SQL Drizzle',
	otel: 'OpenTelemetry observability tracing telemetry',
	rag: 'retrieval augmented generation vector search embeddings',
} as const;
const MIN_ALIAS_PREFIX_LENGTH = 3;

export interface PagefindSearchItem {
	title: string;
	url: string;
	description: string;
	section: string;
}

interface PagefindModule {
	init: () => Promise<void> | void;
	options: (options: { excerptLength?: number }) => Promise<void>;
	debouncedSearch: (
		query: string,
		options?: Record<string, never>,
		debounceTimeout?: number
	) => Promise<PagefindSearch | null>;
}

interface PagefindSearch {
	results: readonly PagefindResult[];
}

interface PagefindResult {
	data: () => Promise<PagefindResultData>;
}

interface PagefindResultData {
	url: string;
	plain_excerpt?: string;
	meta?: {
		title?: string;
		description?: string;
		section?: string;
	};
}

let pagefindPromise: Promise<PagefindModule> | undefined;

function normalizeWords(value: string): string {
	return value.toLowerCase().split(/\W+/).filter(Boolean).join(' ');
}

function expandSearchQuery(input: string): string {
	const trimmedInput = input.trim();
	if (!trimmedInput) {
		return input;
	}

	const words = normalizeWords(trimmedInput).split(' ');
	const aliases = Object.entries(QUERY_ALIASES)
		.filter(([alias]) =>
			words.some(
				(word) =>
					word === alias || (word.length >= MIN_ALIAS_PREFIX_LENGTH && alias.startsWith(word))
			)
		)
		.map(([, terms]) => terms);

	return aliases.length > 0 ? `${trimmedInput} ${aliases.join(' ')}` : trimmedInput;
}

async function loadPagefind(): Promise<PagefindModule> {
	if (!pagefindPromise) {
		const pagefindUrl = new URL(PAGEFIND_MODULE_PATH, window.location.origin).toString();
		pagefindPromise = import(/* @vite-ignore */ pagefindUrl).then(async (module) => {
			const pagefind: PagefindModule = module;
			await pagefind.options({ excerptLength: 18 });
			await pagefind.init();
			return pagefind;
		});
	}

	return pagefindPromise;
}

export async function searchPagefind(input: string): Promise<PagefindSearchItem[]> {
	const query = expandSearchQuery(input);
	const pagefind = await loadPagefind();
	const search = await pagefind.debouncedSearch(query, {}, 150);
	if (!search) {
		return [];
	}

	const results = await Promise.all(
		search.results.slice(0, PAGEFIND_RESULT_LIMIT).map((result) => result.data())
	);

	return results.map((result) => ({
		title: result.meta?.title ?? result.url,
		url: result.url,
		description: result.meta?.description || result.plain_excerpt || '',
		section: result.meta?.section ?? 'Docs',
	}));
}
