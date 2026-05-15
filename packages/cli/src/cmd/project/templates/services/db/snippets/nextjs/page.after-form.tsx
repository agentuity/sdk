{history.length > 0 && (
	<div className="rounded-lg border border-gray-900 bg-black p-8">
		<h3 className="m-0 mb-6 text-xl font-normal leading-none text-white">History</h3>
		<ul className="flex flex-col gap-3 text-xs text-gray-400">
			{history.map((row) => (
				<li
					key={row.id}
					className="flex flex-col gap-0.5 rounded-md border border-gray-900 bg-gray-950 px-4 py-3"
				>
					<span className="text-gray-500 italic">
						{row.sourceText.length > 80
							? `${row.sourceText.slice(0, 80)}\u2026`
							: row.sourceText}
					</span>
					<span className="text-cyan-500">
						<strong className="text-gray-400">{row.language}:</strong> {row.translation}
					</span>
				</li>
			))}
		</ul>
		<p className="mt-4 border-t border-gray-900 pt-4 text-[11px] text-gray-600">
			Postgres in Agentuity
		</p>
	</div>
)}
