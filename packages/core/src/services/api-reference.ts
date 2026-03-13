import { z } from 'zod';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface NamedField {
	name: string;
	type: string;
	description: string;
	required?: boolean;
}

interface FieldSource {
	schema: z.ZodType;
	prefix?: string;
	pick?: string[];
	omit?: string[];
	overrides?: Record<string, Partial<Pick<NamedField, 'type' | 'description'>>>;
}

type FieldDefinition = NamedField[] | FieldSource;

interface RequestBody {
	description: string;
	fields?: FieldDefinition;
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
	responseFields?: FieldDefinition;
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
	return prefix ? `${prefix}.${key}` : key;
}

function extractFields(
	jsonSchema: any,
	prefix: string | undefined,
	requiredSet: Set<string>
): NamedField[] {
	const properties = jsonSchema?.properties;
	if (!properties || typeof properties !== 'object') return [];

	const fields: NamedField[] = [];

	for (const [key, value] of Object.entries(properties)) {
		const prop = value as any;
		const name = fieldName(prefix, key);

		fields.push({
			name,
			type: jsonSchemaTypeToFieldType(prop),
			description: typeof prop?.description === 'string' ? prop.description : '',
			required: requiredSet.has(key),
		});

		// Note: nullable objects (anyOf: [object, null]) are not recursed into.
		// Use a non-nullable sub-schema or manually list sub-fields if expansion is needed.
		if (prop.type === 'object' && prop.properties) {
			const nestedRequired = new Set<string>(Array.isArray(prop.required) ? prop.required : []);
			fields.push(...extractFields(prop, name, nestedRequired));
		}

		if (prop.type === 'array' && prop.items?.type === 'object' && prop.items?.properties) {
			const itemRequired = new Set<string>(
				Array.isArray(prop.items.required) ? prop.items.required : []
			);
			fields.push(...extractFields(prop.items, `${name}[]`, itemRequired));
		}
	}

	return fields;
}

function fieldsFromSchema(schema: z.ZodType, prefix?: string): NamedField[] {
	const jsonSchema = z.toJSONSchema(schema) as any;
	const required = new Set<string>(Array.isArray(jsonSchema?.required) ? jsonSchema.required : []);
	return extractFields(jsonSchema, prefix, required);
}

function resolveFields(definition: FieldDefinition | undefined): NamedField[] | undefined {
	if (!definition) return undefined;
	if (Array.isArray(definition)) return definition;

	let fields = fieldsFromSchema(definition.schema, definition.prefix);

	if (definition.pick) {
		const pickSet = new Set(definition.pick);
		fields = fields.filter((field) => pickSet.has(field.name));
	}

	if (definition.omit) {
		const omitSet = new Set(definition.omit);
		fields = fields.filter((field) => !omitSet.has(field.name));
	}

	if (definition.overrides) {
		fields = fields.map((field) => {
			const override = definition.overrides?.[field.name];
			return override ? { ...field, ...override } : field;
		});
	}

	return fields;
}

export type {
	HttpMethod,
	NamedField,
	FieldSource,
	FieldDefinition,
	RequestBody,
	Param,
	EndpointStatus,
	ResponseHeader,
	Endpoint,
	Service,
};
export { fieldsFromSchema, resolveFields };
