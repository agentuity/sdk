import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
	Endpoint,
	EndpointStatus,
	Param,
	ResponseHeader,
	Service,
} from './api-reference/framework.ts';
import { resolveFields } from './api-reference/framework.ts';
import { apiReferenceRegistry, apiReferenceServices } from './api-reference/registry.ts';

const services: Service[] = apiReferenceServices;

const ROOT_DIR = join(import.meta.dir, '..');
const CONTENT_DIR = join(ROOT_DIR, 'src/web/content/reference/api');
const ROUTES_DIR = join(ROOT_DIR, 'src/web/routes/_docs/reference/api');

async function writeGeneratedFile(path: string, content: string) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${content.trimEnd()}\n`, 'utf-8');
}

function toParamTableInput(
	params: Param[],
	location: 'path' | 'query' | 'body' | 'header'
): Array<{
	name: string;
	type: string;
	in: 'path' | 'query' | 'body' | 'header';
	required: boolean;
	description: string;
	default?: string;
}> {
	return params.map((param) => ({
		name: param.name,
		type: param.type,
		in: location,
		required: param.required ?? true,
		description: param.description,
	}));
}

function renderStatuses(statuses: EndpointStatus[]): string {
	const rows = statuses.map((status) => `| ${status.code} | ${status.description} |`).join('\n');
	return ['| Status | Description |', '|--------|-------------|', rows].join('\n');
}

function renderResponseHeaders(headers: ResponseHeader[], subHeading: string): string {
	if (headers.length === 0) return '';

	const rows = headers
		.map((header) => `| \`${header.name}\` | ${header.description} |`)
		.join('\n');

	return [
		`${subHeading} Response Headers`,
		'',
		'| Header | Description |',
		'|--------|-------------|',
		rows,
	].join('\n');
}

function renderAuthentication(service: Service): string {
	if (service.hasPublicEndpoints) {
		if (service.slug !== 'ai-gateway') {
			return 'Most requests require a Bearer token. Pass your API or SDK key in the `Authorization` header. Public endpoints (such as listing and fetching public snapshots) are noted below and do not require authentication.';
		}
		return 'Most requests require a Bearer token. Pass your API or SDK key in the `Authorization` header. Public endpoints are noted below and do not require authentication.';
	}
	return 'All requests require a Bearer token. Pass your API or SDK key in the `Authorization` header.';
}

function renderEndpointSection(endpoint: Endpoint, headingLevel = 2, host?: string): string {
	const subHeading = '#'.repeat(headingLevel + 1);
	const pathParams = toParamTableInput(endpoint.pathParams, 'path');
	const queryParams = toParamTableInput(endpoint.queryParams, 'query');

	const paramList = [...pathParams, ...queryParams];
	const paramSection =
		paramList.length > 0
			? [
					`${subHeading} Parameters`,
					'',
					`<ParamTable params={${JSON.stringify(paramList, null, 2)}} />`,
				].join('\n')
			: '';

	const requestBodyParts: string[] = [];
	if (endpoint.requestBody) {
		requestBodyParts.push('', `${subHeading} Request Body`, '');
		requestBodyParts.push(endpoint.requestBody.description, '');
		const resolvedRequestFields = resolveFields(endpoint.requestBody.fields);

		if (resolvedRequestFields && resolvedRequestFields.length > 0) {
			requestBodyParts.push(
				`<ResponseFields fields={${JSON.stringify(resolvedRequestFields, null, 2)}} />`,
				''
			);
		}
	}

	const responseParts: string[] = [
		`${subHeading} Response`,
		'',
		endpoint.responseDescription,
		'',
		renderStatuses(endpoint.statuses),
	];

	if (endpoint.responseHeaders && endpoint.responseHeaders.length > 0) {
		responseParts.push('', renderResponseHeaders(endpoint.responseHeaders, subHeading));
	}

	const resolvedResponseFields = resolveFields(endpoint.responseFields);
	if (resolvedResponseFields && resolvedResponseFields.length > 0) {
		responseParts.push(
			'',
			`${subHeading} Response Fields`,
			'',
			`<ResponseFields fields={${JSON.stringify(resolvedResponseFields, null, 2)}} />`
		);
	}

	if (endpoint.ttlNote) {
		responseParts.push('', `${subHeading} Notes`, '', endpoint.ttlNote);
	}

	const exampleProp =
		endpoint.exampleBody !== undefined
			? typeof endpoint.exampleBody === 'string'
				? ` body="${endpoint.exampleBody}"`
				: ` body={${JSON.stringify(endpoint.exampleBody, null, 2)}}`
			: '';

	const headersProp = endpoint.exampleHeaders
		? ` headers={${JSON.stringify(endpoint.exampleHeaders)}}`
		: '';

	const hostProp = host ? ` host="${host}"` : '';

	return [
		`${'#'.repeat(headingLevel)} ${endpoint.title}`,
		'',
		endpoint.description,
		'',
		`<ApiEndpoint method="${endpoint.method}" path="${endpoint.path}"${hostProp} />`,
		'',
		...(endpoint.public ? ['**Authentication:** Public. No auth required.', ''] : []),
		paramSection,
		requestBodyParts.join('\n'),
		responseParts.join('\n'),
		'',
		`${subHeading} Example`,
		'',
		`<ApiExample method="${endpoint.method}" path="${endpoint.examplePath}"${exampleProp}${headersProp}${hostProp} />`,
		'',
		'---',
	].join('\n');
}

function renderServiceMdx(service: Service): string {
	const endpointSectionsParts: string[] = [];
	let currentSectionTitle: string | null = null;

	for (const endpoint of service.endpoints) {
		if (endpoint.sectionTitle && endpoint.sectionTitle !== currentSectionTitle) {
			currentSectionTitle = endpoint.sectionTitle;
			endpointSectionsParts.push(`## ${endpoint.sectionTitle}`);
		}

		endpointSectionsParts.push(
			renderEndpointSection(endpoint, endpoint.sectionTitle ? 3 : 2, service.host)
		);
	}

	const endpointSections = endpointSectionsParts.join('\n\n');

	return `---
title: ${service.name} API
short_title: ${service.name}
description: ${service.description}
---

{/* This file is auto-generated from REST API catalogs. Do not edit manually. Run scripts/generate-api-reference.ts to regenerate. */}


<RegionPicker ${service.host ? `host="${service.host}" ` : ''}/>

## Authentication

${renderAuthentication(service)}

| Header | Value |
|--------|-------|
| \`Authorization\` | \`Bearer YOUR_SDK_KEY\` |

You can find your SDK key in the [Agentuity Console](https://app.agentuity.com) under your project settings.

---

${endpointSections}`;
}

function renderApiIndexMdx() {
	const iconImports = [...new Set(apiReferenceRegistry.map((entry) => entry.icon))].sort();
	const cards = apiReferenceRegistry
		.map(
			(entry) => `  <CardLink
    href="/reference/api/${entry.service.slug}"
    title="${entry.routeTitle}"
    description="${entry.service.description}"
    icon={<${entry.icon} className="size-5" />}
  />`
		)
		.join('\n');

	return `---
title: REST API Reference
description: Direct HTTP access to Agentuity platform services
---

{/* This file is auto-generated from REST API catalogs. Do not edit manually. Run scripts/generate-api-reference.ts to regenerate. */}

import { ${iconImports.join(', ')} } from 'lucide-react';

Access any Agentuity Platform Service directly via REST APIs, the TypeScript SDK or the CLI.

<Cards>
${cards}
</Cards>`;
}

function routeDeclaration(routePath: string): string {
	const singleLine = `export const Route = createFileRoute('/_docs/${routePath}')({`;
	if (singleLine.length <= 100) {
		return singleLine;
	}
	return `export const Route = createFileRoute(
\t'/_docs/${routePath}'
)({`;
}

function contentImport(mdxImportPath: string): string {
	const singleLine = `import Content, { frontmatter, tableOfContents } from '${mdxImportPath}';`;
	if (singleLine.length <= 100) {
		return singleLine;
	}
	return `import Content, {
\tfrontmatter,
\ttableOfContents,
} from '${mdxImportPath}';`;
}

function renderRouteFile(routePath: string, mdxImportPath: string, crumb: string): string {
	return `import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';
import type { MDXModule } from '../../../../components/docs/mdx-page';
${contentImport(mdxImportPath)}

const mdxModule = {
\tdefault: Content,
\tfrontmatter,
\ttableOfContents,
} satisfies MDXModule;

${routeDeclaration(routePath)}
\tcomponent: () => <MDXPage module={mdxModule} />,
\tstaticData: { crumb: '${crumb.replace(/'/g, "\\'")}' },
});`;
}

function renderServiceRoute(service: Service): string {
	return renderRouteFile(
		`reference/api/${service.slug}`,
		`../../../../content/reference/api/${service.slug}.mdx`,
		service.name
	);
}

function renderApiIndexRoute(): string {
	return renderRouteFile(
		'reference/api/',
		'../../../../content/reference/api/index.mdx',
		'REST API Reference'
	);
}

async function main() {
	for (const service of services) {
		await writeGeneratedFile(join(CONTENT_DIR, `${service.slug}.mdx`), renderServiceMdx(service));
		await writeGeneratedFile(
			join(ROUTES_DIR, `${service.slug}.tsx`),
			renderServiceRoute(service)
		);
	}

	await writeGeneratedFile(join(CONTENT_DIR, 'index.mdx'), renderApiIndexMdx());
	await writeGeneratedFile(
		join(CONTENT_DIR, 'meta.json'),
		JSON.stringify(
			{
				title: 'API Reference',
				sort: 'title',
				pages: services.map((service) => service.slug).sort(),
			},
			null,
			'\t'
		)
	);

	await writeGeneratedFile(join(ROUTES_DIR, 'index.tsx'), renderApiIndexRoute());

	console.log(`Generated API reference files for ${services.length} services`);
}

main().catch((error) => {
	console.error('Failed to generate API reference files:', error);
	process.exit(1);
});
