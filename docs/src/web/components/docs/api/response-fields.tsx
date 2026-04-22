interface ResponseField {
	name: string;
	type: string;
	description: string;
	required?: boolean;
}

interface ResponseFieldsProps {
	fields: ResponseField[];
}

export function ResponseFields({ fields }: ResponseFieldsProps) {
	if (fields.length === 0) {
		return (
			<p className="text-sm text-zinc-600 dark:text-zinc-400">No structured response fields.</p>
		);
	}

	return (
		<div className="my-6 w-full overflow-x-auto">
			<table className="w-full text-sm">
				<thead className="border-b border-zinc-200 dark:border-zinc-800">
					<tr>
						<th className="h-11 px-4 text-left font-medium text-zinc-900 dark:text-zinc-100">
							Field
						</th>
						<th className="h-11 px-4 text-left font-medium text-zinc-900 dark:text-zinc-100">
							Type
						</th>
						<th className="h-11 px-4 text-left font-medium text-zinc-900 dark:text-zinc-100">
							Description
						</th>
					</tr>
				</thead>
				<tbody>
					{fields.map((field) => (
						<tr key={field.name} className="border-b border-zinc-200 dark:border-zinc-800">
							<td className="p-4 align-top text-zinc-700 dark:text-zinc-300">
								<code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
									{field.name}
								</code>
							</td>
							<td className="p-4 align-top text-zinc-600 dark:text-zinc-400">
								{field.type}
							</td>
							<td className="p-4 align-top text-zinc-600 dark:text-zinc-400">
								{field.description}
								{field.required === false ? (
									<>
										{' '}
										<span className="text-zinc-500 dark:text-zinc-500">(optional)</span>
									</>
								) : null}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
