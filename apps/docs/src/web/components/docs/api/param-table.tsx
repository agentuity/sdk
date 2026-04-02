import { Fragment } from 'react';

type ParamLocation = 'path' | 'query' | 'body' | 'header';

interface Param {
	name: string;
	type: string;
	in: ParamLocation;
	required: boolean;
	description: string;
	default?: string;
}

interface ParamTableProps {
	params: Param[];
}

const ORDER: ParamLocation[] = ['path', 'query', 'header', 'body'];

function groupParams(params: Param[]) {
	return ORDER.map((location) => ({
		location,
		items: params.filter((param) => param.in === location),
	})).filter((group) => group.items.length > 0);
}

export function ParamTable({ params }: ParamTableProps) {
	if (params.length === 0) {
		return <p className="text-sm text-zinc-600 dark:text-zinc-400">No parameters.</p>;
	}

	const groups = groupParams(params);

	return (
		<div className="my-6 space-y-5">
			{groups.map((group) => (
				<Fragment key={group.location}>
					<div className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 font-mono text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
						{group.location}
					</div>
					<div className="w-full overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b border-zinc-200 dark:border-zinc-800">
								<tr>
									<th className="h-11 px-4 text-left font-medium text-zinc-900 dark:text-zinc-100">
										Name
									</th>
									<th className="h-11 px-4 text-left font-medium text-zinc-900 dark:text-zinc-100">
										Type
									</th>
									<th className="h-11 px-4 text-left font-medium text-zinc-900 dark:text-zinc-100">
										Required
									</th>
									<th className="h-11 px-4 text-left font-medium text-zinc-900 dark:text-zinc-100">
										Description
									</th>
								</tr>
							</thead>
							<tbody>
								{group.items.map((param) => (
									<tr
										key={`${group.location}-${param.name}`}
										className="border-b border-zinc-200 dark:border-zinc-800"
									>
										<td className="p-4 align-top text-zinc-700 dark:text-zinc-300">
											<code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
												{param.name}
											</code>
										</td>
										<td className="p-4 align-top text-zinc-600 dark:text-zinc-400">
											{param.type}
										</td>
										<td className="p-4 align-top">
											<span
												className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
													param.required
														? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300'
														: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
												}`}
											>
												{param.required ? 'Yes' : 'No'}
											</span>
										</td>
										<td className="p-4 align-top text-zinc-600 dark:text-zinc-400">
											{param.description}
											{param.default && (
												<>
													{' '}
													<span className="text-zinc-500 dark:text-zinc-500">
														Default: {param.default}
													</span>
												</>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Fragment>
			))}
		</div>
	);
}
