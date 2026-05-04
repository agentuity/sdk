watch(result, (val) => {
	if (val?.translation) {
		refreshHistory();
	}
});
