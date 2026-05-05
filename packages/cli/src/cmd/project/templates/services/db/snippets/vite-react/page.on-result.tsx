useEffect(() => {
	if (mutation.data?.translation) {
		historyQuery.refetch();
	}
}, [mutation.data]);
