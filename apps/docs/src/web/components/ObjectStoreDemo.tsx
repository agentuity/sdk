import { useCallback, useEffect, useState } from 'react';

interface FileInfo {
	key: string;
	filename: string;
	size: number;
	lastModified?: string;
}

interface ListResult {
	success: boolean;
	count: number;
	files: FileInfo[];
	error?: string;
}

interface PresignResult {
	success: boolean;
	url: string;
	filename: string;
	expiresIn: string;
	error?: string;
}

interface PresignInfo {
	url: string;
	expiresIn: string;
	filename: string;
}

// Sample document that comes pre-seeded
const SAMPLE_DOC = { name: 'hello.txt', description: 'Sample text file' };

export function ObjectStoreDemo() {
	const [files, setFiles] = useState<FileInfo[]>([]);
	const [presignInfo, setPresignInfo] = useState<PresignInfo | null>(null);
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [seeded, setSeeded] = useState(false);

	// Stable fetch function
	const fetchFiles = useCallback(async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/object-storage/list');
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const result: ListResult = await response.json();
			if (result.success) {
				setFiles(result.files);
				// Check if sample file exists
				if (result.files.some((f) => f.filename === 'hello.txt')) {
					setSeeded(true);
				}
			} else {
				setError(result.error || 'Failed to list files');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to list files');
		} finally {
			setLoading(false);
		}
	}, []);

	// Fetch on mount
	useEffect(() => {
		fetchFiles();
	}, [fetchFiles]);

	const seedData = async () => {
		setLoading(true);
		setError(null);
		try {
			const response = await fetch('/api/object-storage/seed', {
				method: 'POST',
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const result = await response.json();
			if (result.success) {
				setSeeded(true);
				await fetchFiles();
			} else {
				// If already seeded, still mark as seeded
				if (result.message?.includes('already')) {
					setSeeded(true);
					await fetchFiles();
				} else {
					setError(result.message || 'Failed to seed data');
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to seed data');
		} finally {
			setLoading(false);
		}
	};

	const handlePresign = async (fileToPresign: string) => {
		setError(null);
		setCopied(false);
		try {
			const response = await fetch(
				`/api/object-storage/presign/${encodeURIComponent(fileToPresign)}`,
				{ method: 'POST' }
			);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const result: PresignResult = await response.json();

			if (result.success) {
				setPresignInfo({
					url: result.url,
					expiresIn: result.expiresIn,
					filename: result.filename,
				});
			} else {
				setError(result.error || 'Presign failed');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Presign failed');
		}
	};

	const copyToClipboard = async () => {
		if (presignInfo?.url) {
			try {
				await navigator.clipboard.writeText(presignInfo.url);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			} catch {
				setError('Failed to copy to clipboard');
			}
		}
	};

	const formatSize = (bytes: number) => {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<div className="flex flex-col gap-4">
			{/* Sample data controls */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
				<div className="flex items-center gap-3">
					<span className="text-zinc-500 text-xs uppercase">Document:</span>
					<span
						className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs px-3 py-1 rounded-full"
						title={SAMPLE_DOC.description}
					>
						{SAMPLE_DOC.name}
					</span>
					{!seeded && (
						<button
							onClick={seedData}
							disabled={loading}
							type="button"
							className={`bg-cyan-500 dark:bg-cyan-400 text-white dark:text-black rounded-md text-xs px-3 py-1.5 cursor-pointer ${
								loading ? 'opacity-50' : 'hover:bg-cyan-400 dark:hover:bg-cyan-300'
							}`}
						>
							{loading ? 'Loading...' : 'Load Sample Data'}
						</button>
					)}
					{seeded && (
						<span className="text-green-600 dark:text-green-400 text-xs">Loaded</span>
					)}
				</div>
			</div>

			{/* Error display */}
			{error && (
				<div className="bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-900 rounded-lg text-red-700 dark:text-red-300 text-sm p-4">
					{error}
				</div>
			)}

			{/* File list */}
			<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg">
				<div className="border-b border-zinc-200 dark:border-zinc-900 text-zinc-500 text-xs font-medium px-4 py-3 uppercase">
					Files ({files.length})
				</div>
				{files.length === 0 ? (
					<div className="text-zinc-500 dark:text-zinc-600 text-sm p-8 text-center">
						No files yet. Click "Load Sample Data" to add a sample file.
					</div>
				) : (
					<div className="divide-y divide-zinc-200 dark:divide-zinc-900 max-h-64 overflow-auto">
						{files.map((file) => (
							<div key={file.key} className="px-4 py-3 flex items-center justify-between">
								<div className="flex flex-col">
									<span className="text-zinc-900 dark:text-white text-sm font-mono">
										{file.filename}
									</span>
									<span className="text-zinc-500 text-xs">
										{formatSize(file.size)}
										{file.lastModified &&
											` | ${new Date(file.lastModified).toLocaleDateString()}`}
									</span>
								</div>
								<div className="flex gap-3">
									<button
										type="button"
										onClick={() => handlePresign(file.filename)}
										className="text-cyan-700 dark:text-cyan-400 text-xs hover:text-cyan-500 dark:hover:text-cyan-300 cursor-pointer bg-transparent border-none"
									>
										Presign URL
									</button>
									<a
										href={`/api/object-storage/download/${encodeURIComponent(file.filename)}`}
										className="text-blue-600 dark:text-blue-400 text-xs hover:text-blue-500 dark:hover:text-blue-300"
										download
									>
										Download
									</a>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Presign result */}
			{presignInfo && (
				<div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-900 rounded-lg p-4">
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-2">
							<span className="text-zinc-500 text-xs uppercase">Presigned URL</span>
							<span className="text-zinc-500 dark:text-zinc-600 text-xs">
								({presignInfo.filename} · expires in {presignInfo.expiresIn})
							</span>
						</div>
						<button
							type="button"
							onClick={copyToClipboard}
							className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
								copied
									? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400'
									: 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-300'
							}`}
						>
							{copied ? 'Copied!' : 'Copy URL'}
						</button>
					</div>
					<div className="text-zinc-600 dark:text-zinc-400 text-sm font-mono break-all bg-zinc-100 dark:bg-zinc-950 rounded p-3 border border-zinc-300 dark:border-zinc-800">
						{presignInfo.url}
					</div>
				</div>
			)}
		</div>
	);
}
