const [exportInfo, setExportInfo] = useState<{ filename: string; size: number } | null>(null);
const [isExporting, setIsExporting] = useState(false);

const handleExport = async () => {
	setIsExporting(true);
	try {
		const res = await fetch('/api/export', { method: 'POST' });
		if (res.ok) setExportInfo(await res.json());
	} finally {
		setIsExporting(false);
	}
};
