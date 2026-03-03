export type ResourceType = 'database' | 'queue';

export interface EnvField {
	key: string;
	defaultValue: string;
	comment?: string;
	resource?: ResourceType;
	required?: boolean;
}

export function detectResourceFromKey(key: string): ResourceType | undefined {
	const upper = key.toUpperCase();

	// Database patterns
	if (
		upper === 'DATABASE_URL' ||
		upper === 'POSTGRES_URL' ||
		upper === 'DB_URL' ||
		upper === 'PG_URL' ||
		upper === 'PGURL' ||
		(/(?:DATABASE|POSTGRES|PG)/.test(upper) && /(?:URL|URI|DSN|CONNECTION)/.test(upper))
	) {
		return 'database';
	}

	// Queue patterns
	if (upper === 'QUEUE_URL' || upper === 'QUEUE_NAME' || /QUEUE/.test(upper)) {
		return 'queue';
	}

	return undefined;
}

export function parseEnvExample(content: string): EnvField[] {
	const lines = content.split('\n');
	const varMap = new Map<string, EnvField>();
	let lastComment = '';

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.startsWith('#')) {
			lastComment = trimmed.slice(1).trim();
			continue;
		}
		if (trimmed === '') {
			lastComment = '';
			continue;
		}
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx > 0) {
			const key = trimmed.slice(0, eqIdx).trim();
			let valueAndComment = trimmed.slice(eqIdx + 1);

			// Check for inline #agentuity:<type> annotations
			let resource: ResourceType | undefined;
			let required = false;
			const annotations = valueAndComment.matchAll(/#agentuity:(\w+)/g);
			for (const match of annotations) {
				const annotatedType = match[1]?.toLowerCase();
				if (annotatedType === 'database' || annotatedType === 'queue') {
					resource = annotatedType;
				} else if (annotatedType === 'required') {
					required = true;
				}
			}
			// Strip all annotations from the value
			valueAndComment = valueAndComment.replace(/#agentuity:\w+/g, '').trim();

			// Strip any trailing inline comment
			const commentIdx = valueAndComment.indexOf('#');
			const defaultValue =
				commentIdx >= 0 ? valueAndComment.slice(0, commentIdx).trim() : valueAndComment.trim();

			// Fallback: pattern matching on key name if no annotation
			if (!resource) {
				resource = detectResourceFromKey(key);
			}

			varMap.set(key, {
				key,
				defaultValue,
				comment: lastComment || undefined,
				resource,
				required: required || !!resource,
			});
			lastComment = '';
		}
	}
	return Array.from(varMap.values());
}
