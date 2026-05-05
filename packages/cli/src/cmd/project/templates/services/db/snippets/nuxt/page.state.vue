const { data: history, refresh: refreshHistory } = useFetch<Translation[]>('/api/history', {
	default: () => [],
});
