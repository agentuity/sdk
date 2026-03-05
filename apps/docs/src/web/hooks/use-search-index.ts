import { useRef, useState, useCallback } from 'react';
import MiniSearch from 'minisearch';

interface SearchEntry {
	id: string;
	title: string;
	pageTitle: string;
	section: string;
	url: string;
	searchText: string;
	snippet: string;
	isPageLevel: boolean;
}

export interface SearchResult {
	id: string;
	title: string;
	pageTitle: string;
	section: string;
	url: string;
	snippet: string;
	isPageLevel: boolean;
	score: number;
	terms: string[];
	queryTerms: string[];
	match: Record<string, string[]>;
}

let index: MiniSearch<SearchEntry> | null = null;
let indexPromise: Promise<MiniSearch<SearchEntry>> | null = null;

function getIndex(): Promise<MiniSearch<SearchEntry>> {
	if (index) return Promise.resolve(index);
	if (indexPromise) return indexPromise;
	indexPromise = fetch('/search-index.json')
		.then((res) => {
			if (!res.ok) throw new Error(`Failed to load search index: ${res.status}`);
			return res.json();
		})
		.then((data: { entries: SearchEntry[] }) => {
			index = new MiniSearch<SearchEntry>({
				fields: ['title', 'pageTitle', 'searchText'],
				storeFields: ['id', 'title', 'pageTitle', 'section', 'url', 'snippet', 'isPageLevel'],
				searchOptions: {
					boost: { title: 3, pageTitle: 2, searchText: 1 },
					prefix: true,
					fuzzy: (term: string) => (term.length <= 5 ? false : 0.2),
					weights: { fuzzy: 0.5, prefix: 0.9 },
					boostDocument: (_id, _term, storedFields) =>
						storedFields?.isPageLevel ? 1.5 : 1,
				},
			});
			index.addAll(data.entries);
			return index;
		})
		.catch((err) => {
			indexPromise = null;
			throw err;
		});
	return indexPromise;
}

export function useSearchIndex() {
	const indexRef = useRef<MiniSearch<SearchEntry> | null>(null);
	const [loading, setLoading] = useState(false);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState(false);
	const initPromiseRef = useRef<Promise<void> | null>(null);

	const ensureIndex = useCallback(() => {
		if (indexRef.current) return Promise.resolve();
		if (initPromiseRef.current) return initPromiseRef.current;
		setLoading(true);
		setError(false);
		initPromiseRef.current = getIndex()
			.then((idx) => {
				indexRef.current = idx;
				setReady(true);
			})
			.catch(() => {
				initPromiseRef.current = null;
				setError(true);
			})
			.finally(() => {
				setLoading(false);
			});
		return initPromiseRef.current;
	}, []);

	const search = useCallback(
		(query: string): SearchResult[] => {
			if (!query.trim() || !indexRef.current) return [];
			return indexRef.current.search(query) as unknown as SearchResult[];
		},
		[]
	);

	return { search, loading, ready, error, ensureIndex };
}
