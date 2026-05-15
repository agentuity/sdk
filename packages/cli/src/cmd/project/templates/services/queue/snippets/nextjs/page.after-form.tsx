{jobs.length > 0 && (
	<div className="rounded-lg border border-gray-900 bg-black p-8">
		<div className="mb-6 flex flex-col gap-1">
			<h3 className="m-0 text-xl font-normal leading-none text-white">Queued translations</h3>
			<p className="text-xs text-gray-500">
				Messages published to <code className="text-gray-400">translate-jobs</code>. Add a worker to process them.
			</p>
		</div>
		<ul className="flex flex-col gap-3 text-xs text-gray-400">
			{jobs.map((job) => (
				<li
					key={job.id}
					className="flex flex-col gap-1 rounded-md border border-gray-900 bg-gray-950 px-4 py-3"
				>
					<span className="text-gray-500">
						<strong className="text-cyan-500">queued</strong> · {job.id} · offset {job.offset}
					</span>
					<span className="italic">
						{job.text.length > 80 ? `${job.text.slice(0, 80)}\u2026` : job.text}
						<span className="text-gray-600"> → {job.toLanguage}</span>
					</span>
				</li>
			))}
		</ul>
		<p className="mt-4 border-t border-gray-900 pt-4 text-[11px] text-gray-600">
			Queue powered by <code className="text-gray-500">@agentuity/queue</code>
		</p>
	</div>
)}
