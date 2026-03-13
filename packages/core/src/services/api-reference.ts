import { z } from 'zod';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface NamedField {
	name: string;
	type: string;
	description: string;
	required?: boolean;
}

interface RequestBody {
	description: string;
	fields?: NamedField[];
}

interface Param {
	name: string;
	type: string;
	description: string;
	required?: boolean;
}

interface EndpointStatus {
	code: number;
	description: string;
}

interface ResponseHeader {
	name: string;
	description: string;
}

interface Endpoint {
	id: string;
	title: string;
	sectionTitle?: string;
	method: HttpMethod;
	path: string;
	description: string;
	pathParams: Param[];
	queryParams: Param[];
	requestBody: RequestBody | null;
	responseDescription: string;
	responseHeaders?: ResponseHeader[];
	responseFields?: NamedField[];
	statuses: EndpointStatus[];
	examplePath: string;
	exampleBody?: string | object;
	exampleHeaders?: Record<string, string>;
	ttlNote?: string;
}

interface Service {
	name: string;
	slug: string;
	description: string;
	host?: string;
	hasPublicEndpoints?: boolean;
	endpoints: Endpoint[];
	icon?: string;
}

function jsonSchemaTypeToFieldType(schema: any): string {
	if (!schema || typeof schema !== 'object') return 'any';

	if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
		const mapped = schema.anyOf.map((part: any) => jsonSchemaTypeToFieldType(part));
		return [...new Set(mapped)].join(' | ');
	}

	if (schema.type === 'integer') return 'number';
	if (schema.type === 'array') {
		if (schema.items?.type) {
			const itemType = jsonSchemaTypeToFieldType(schema.items);
			return itemType === 'any' ? 'array' : `${itemType}[]`;
		}
		return 'array';
	}

	if (typeof schema.type === 'string') return schema.type;

	return 'any';
}

function fieldName(prefix: string | undefined, key: string): string {
	if (!prefix) return key;
	if (prefix.endsWith('[]') || prefix.endsWith('{key}')) return `${prefix}.${key}`;
	return `${prefix}.${key}`;
}

function fieldsFromSchema(schema: z.ZodType, prefix?: string): NamedField[] {
	const jsonSchema = z.toJSONSchema(schema) as any;
	const properties = jsonSchema?.properties;
	const required = new Set<string>(Array.isArray(jsonSchema?.required) ? jsonSchema.required : []);

	if (!properties || typeof properties !== 'object') return [];

	return Object.entries(properties).map(([key, value]) => {
		const prop = value as any;
		return {
			name: fieldName(prefix, key),
			type: jsonSchemaTypeToFieldType(prop),
			description: typeof prop?.description === 'string' ? prop.description : '',
			required: required.has(key),
		};
	});
}

export type {
	HttpMethod,
	NamedField,
	RequestBody,
	Param,
	EndpointStatus,
	ResponseHeader,
	Endpoint,
	Service,
};
export { fieldsFromSchema };
