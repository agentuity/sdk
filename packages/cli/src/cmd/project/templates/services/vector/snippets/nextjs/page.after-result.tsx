{similar.length > 0 && (
	<div className="rounded-md border border-gray-900 bg-gray-950 px-4 py-3 text-xs text-gray-400">
		<div className="mb-2 text-gray-500">Similar past translations</div>
		<ul className="flex flex-col gap-1.5">
			{similar.map((hit) => (
				<li key={hit.key} className="flex items-center justify-between gap-3">
					<span className="text-gray-300">{hit.metadata?.translation ?? hit.key}</span>
					<span className="text-gray-600">{hit.similarity.toFixed(3)}</span>
				</li>
			))}
		</ul>
	</div>
)}
