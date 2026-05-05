const historyQuery = useQuery<Translation[]>({
	queryKey: ['history'],
	queryFn: async () => {
		const res = await fetch('/api/history');
		if (!res.ok) throw new Error('Failed to load history');
		return res.json();
	},
});
const history = historyQuery.data ?? [];
