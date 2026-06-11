import { Check, CopyIcon, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePersistentDemoState } from '../hooks/usePersistentDemoState';
import { Button, Separator } from './ui';

interface FileInfo {
	key: string;
	filename: string;
	size: number;
	lastModified?: string;
}

interface ListResult {
	success: boolean;
	configured?: boolean;
	count: number;
	files: FileInfo[];
	error?: string;
	message?: string;
}

interface SeedResult {
	success: boolean;
	configured?: boolean;
	message?: string;
	error?: string;
}

interface PresignResult {
	success: boolean;
	configured?: boolean;
	url?: string;
	urlType?: 'presigned';
	filename?: string;
	expiresIn?: string;
	error?: string;
	message?: string;
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
	const [lastPresignedFile, setLastPresignedFile, clearLastPresignedFile] = usePersistentDemoState<
		string | null
	>('object-storage', 'last-presigned-file', {
		defaultValue: null,
		storage: 'session',
	});
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [seeding, setSeeding] = useState(false);
	const [seeded, setSeeded] = useState(false);
	const [configured, setConfigured] = useState(true);
	const restoredPresignRef = useRef(false);

	const applyFiles = useCallback((nextFiles: FileInfo[]) => {
		setFiles(nextFiles);
		setSeeded(nextFiles.some((file) => file.filename === SAMPLE_DOC.name));
	}, []);

	const fetchFiles = useCallback(async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/object-storage/list');
			const result: ListResult = await response.json();
			if (result.success) {
				setConfigured(true);
				applyFiles(result.files);
				setError(null);
			} else {
				if (result.configured === false) {
					setConfigured(false);
					applyFiles([]);
				}
				setError(result.message || result.error || 'Failed to list files');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to list files');
		} finally {
			setLoading(false);
		}
	}, [applyFiles]);

	// Fetch on mount
	useEffect(() => {
		fetchFiles();
	}, [fetchFiles]);

	const seedData = async () => {
		setLoading(true);
		setSeeding(true);
		setError(null);
		try {
			const response = await fetch('/api/object-storage/seed', {
				method: 'POST',
			});

			const result: SeedResult = await response.json();
			if (!response.ok) {
				if (result.configured === false) {
					setConfigured(false);
				}
				throw new Error(result.message || result.error || `HTTP ${response.status}`);
			}

			if (result.success) {
				setConfigured(true);
				setSeeded(true);
				await fetchFiles();
			} else {
				// If already seeded, still mark as seeded
				if (result.message?.includes('already')) {
					setConfigured(true);
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
			setSeeding(false);
		}
	};

	const handlePresign = useCallback(
		async (fileToPresign: string, options: { persist?: boolean } = {}) => {
			setError(null);
			setCopied(false);
			try {
				const response = await fetch(
					`/api/object-storage/presign/${encodeURIComponent(fileToPresign)}`,
					{ method: 'POST' }
				);

				const result: PresignResult = await response.json();

				if (!response.ok) {
					if (result.configured === false) {
						setConfigured(false);
					}
					throw new Error(result.message || result.error || `HTTP ${response.status}`);
				}

				if (result.success) {
					if (!result.url || !result.filename || !result.expiresIn) {
						throw new Error('Presign response was missing URL details');
					}
					setConfigured(true);
					setPresignInfo({
						url: new URL(result.url, window.location.origin).href,
						expiresIn: result.expiresIn,
						filename: result.filename,
					});
					if (options.persist !== false) {
						setLastPresignedFile(result.filename);
					}
				} else {
					setError(result.message || result.error || 'Presign failed');
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Presign failed');
			}
		},
		[setLastPresignedFile]
	);

	useEffect(() => {
		if (restoredPresignRef.current || !lastPresignedFile || files.length === 0) {
			return;
		}

		restoredPresignRef.current = true;

		if (!files.some((file) => file.filename === lastPresignedFile)) {
			clearLastPresignedFile();
			return;
		}

		void handlePresign(lastPresignedFile, { persist: false });
	}, [clearLastPresignedFile, files, handlePresign, lastPresignedFile]);

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
					<Button
						variant="success"
						size="sm"
						onClick={seedData}
						disabled={loading || seeded || !configured}
					>
						<span className="relative">
							<span className={seeding || seeded ? 'invisible' : ''}>Load Sample Data</span>
							{seeding && !seeded && (
								<span
									className="absolute inset-0 flex items-center justify-center"
									data-loading="true"
								/>
							)}
							{seeded && (
								<span className="absolute inset-0 flex items-center justify-center">
									Loaded
								</span>
							)}
						</span>
					</Button>
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
				<div className="text-zinc-500 text-xs font-medium px-4 py-3 uppercase">
					Files ({files.length})
				</div>
				<Separator />
				{files.length === 0 ? (
					<div className="text-zinc-500 dark:text-zinc-600 text-sm p-8 text-center">
						{!configured
							? 'No files available until storage is configured.'
							: loading
								? 'Loading files...'
								: 'No files yet. Click "Load Sample Data" to add a sample file.'}
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
								<div className="flex items-center gap-3">
									<Button
										variant="ghost"
										size="xs"
										onClick={() => handlePresign(file.filename)}
									>
										Presign URL
									</Button>
									<Button variant="ghost" size="xs" asChild>
										<a
											href={`/api/object-storage/download/${encodeURIComponent(file.filename)}`}
											download
										>
											Download
										</a>
									</Button>
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
						<div className="flex items-center gap-2">
							<Button variant="outline" size="xs" asChild>
								<a href={presignInfo.url} target="_blank" rel="noreferrer">
									<ExternalLink aria-hidden="true" />
									<span>Open</span>
								</a>
							</Button>
							<Button variant="outline" size="xs" onClick={copyToClipboard}>
								{copied ? (
									<>
										<Check
											aria-hidden="true"
											className="text-green-600 dark:text-green-400"
										/>
										<span className="text-green-600 dark:text-green-400">Copied!</span>
									</>
								) : (
									<>
										<CopyIcon aria-hidden="true" />
										<span>Copy</span>
									</>
								)}
							</Button>
						</div>
					</div>
					<div className="text-zinc-600 dark:text-zinc-400 text-sm font-mono break-all bg-zinc-100 dark:bg-zinc-950 rounded p-3 border border-zinc-300 dark:border-zinc-800">
						{presignInfo.url}
					</div>
				</div>
			)}
		</div>
	);
}
