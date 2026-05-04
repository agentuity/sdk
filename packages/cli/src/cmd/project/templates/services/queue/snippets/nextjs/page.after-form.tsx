{jobs.length > 0 && (
	<div className="rounded-lg border border-gray-900 bg-black p-8">
		<h3 className="m-0 mb-6 text-xl font-normal leading-none text-white">Pending jobs</h3>
		<ul className="flex flex-col gap-3 text-xs text-gray-400">
			{jobs.map((job) => (
				<li
					key={job.id}
					className="flex flex-col gap-0.5 rounded-md border border-gray-900 bg-gray-950 px-4 py-3"
				>
					<span className="text-gray-500">
						<strong className="text-cyan-500">queued</strong> · {job.id}
					</span>
					<span className="italic">
						{job.text.length > 80 ? `${job.text.slice(0, 80)}\u2026` : job.text}
						<span className="text-gray-600"> → {job.toLanguage}</span>
					</span>
				</li>
			))}
		</ul>
	</div>
)}
