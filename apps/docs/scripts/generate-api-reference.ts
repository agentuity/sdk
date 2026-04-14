import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
	Endpoint,
	EndpointStatus,
	Param,
	ResponseHeader,
	Service,
} from '../../../packages/core/src/services/api-reference.ts';
import { resolveFields } from '../../../packages/core/src/services/api-reference.ts';
import apiKeysService from '../../../packages/core/src/services/apikey/api-reference.ts';
import coderService from '../../../packages/core/src/services/coder/api-reference.ts';
import databaseService from '../../../packages/core/src/services/db/api-reference.ts';
import emailService from '../../../packages/core/src/services/email/api-reference.ts';
import evaluationsService from '../../../packages/core/src/services/eval/api-reference.ts';
import kvService from '../../../packages/core/src/services/keyvalue/api-reference.ts';
import machinesService from '../../../packages/core/src/services/machine/api-reference.ts';
import oauthService from '../../../packages/core/src/services/oauth/api-reference.ts';
import organizationsService from '../../../packages/core/src/services/org/api-reference.ts';
import projectsService from '../../../packages/core/src/services/project/api-reference.ts';
import queuesService from '../../../packages/core/src/services/queue/api-reference.ts';
import regionService from '../../../packages/core/src/services/region/api-reference.ts';
import sandboxesService from '../../../packages/core/src/services/sandbox/api-reference.ts';
import schedulesService from '../../../packages/core/src/services/schedule/api-reference.ts';
import sessionsService from '../../../packages/core/src/services/session/api-reference.ts';
import objectStorageService from '../../../packages/core/src/services/storage/api-reference.ts';
import streamsService from '../../../packages/core/src/services/stream/api-reference.ts';
import tasksService from '../../../packages/core/src/services/task/api-reference.ts';
import threadService from '../../../packages/core/src/services/thread/api-reference.ts';
import userService from '../../../packages/core/src/services/user/api-reference.ts';
import vectorService from '../../../packages/core/src/services/vector/api-reference.ts';
import webhooksService from '../../../packages/core/src/services/webhook/api-reference.ts';

const services: Service[] = [
	apiKeysService,
	coderService,
	databaseService,
	streamsService,
	emailService,
	evaluationsService,
	kvService,
	machinesService,
	queuesService,
	oauthService,
	objectStorageService,
	organizationsService,
	projectsService,
	regionService,
	sandboxesService,
	schedulesService,
	sessionsService,
	tasksService,
	threadService,
	userService,
	vectorService,
	webhooksService,
];

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

{/* This file is auto-generated from Zod schemas. Do not edit manually. Run scripts/generate-api-reference.ts to regenerate. */}


<RegionPicker ${service.host ? `host="${service.host}" ` : ''}/>

## Authentication

${service.hasPublicEndpoints ? 'Most requests require a Bearer token. Pass your API or SDK key in the `Authorization` header. Public endpoints (such as listing and fetching public snapshots) are noted below and do not require authentication.' : 'All requests require a Bearer token. Pass your API or SDK key in the `Authorization` header.'}

| Header | Value |
|--------|-------|
| \`Authorization\` | \`Bearer YOUR_SDK_KEY\` |

You can find your SDK key in the [Agentuity Console](https://app.agentuity.com) under your project settings.

---

${endpointSections}`;
}

function renderApiIndexMdx() {
	return `---
title: REST API Reference
description: Direct HTTP access to Agentuity platform services
---

{/* This file is auto-generated from Zod schemas. Do not edit manually. Run scripts/generate-api-reference.ts to regenerate. */}

import { Activity, Box, BrainCircuit, Building, CheckCircle, Clock, Database, FolderKanban, Globe, HardDrive, Key, Layers, ListTodo, Mail, MessageSquare, Search, Server, Shield, Table, Timer, User, Webhook } from 'lucide-react';

Access any Agentuity Platform Service directly via REST APIs, the TypeScript SDK or the CLI.

<Cards>
  <CardLink
    href="/reference/api/api-keys"
    title="API Keys"
    description="Create and manage API keys for authentication"
    icon={<Key className="size-5" />}
  />
  <CardLink
    href="/reference/api/coder"
    title="Coder"
    description="Manage Coder sessions, custom agents, session data, loop state, and known users through the REST API"
    icon={<BrainCircuit className="size-5" />}
  />
  <CardLink
    href="/reference/api/database"
    title="Database"
    description="Execute queries, inspect tables, and monitor database performance"
    icon={<Table className="size-5" />}
  />
  <CardLink
    href="/reference/api/streams"
    title="Durable Streams"
    description="Create durable, resumable data streams with public URLs"
    icon={<Activity className="size-5" />}
  />
  <CardLink
    href="/reference/api/email"
    title="Email"
    description="Send and receive emails with managed addresses and webhook destinations"
    icon={<Mail className="size-5" />}
  />
  <CardLink
    href="/reference/api/evaluations"
    title="Evaluations"
    description="List and retrieve evaluations and their run history"
    icon={<CheckCircle className="size-5" />}
  />
  <CardLink
    href="/reference/api/key-value"
    title="Key-Value Storage"
    description="Store and retrieve data by key within namespaces"
    icon={<Database className="size-5" />}
  />
  <CardLink
    href="/reference/api/machines"
    title="Machines"
    description="Manage compute nodes and organization authentication enrollment"
    icon={<Server className="size-5" />}
  />
  <CardLink
    href="/reference/api/queues"
    title="Message Queues"
    description="Publish, consume, and manage messages with worker and pub/sub queues"
    icon={<Layers className="size-5" />}
  />
  <CardLink
    href="/reference/api/oauth"
    title="OAuth Applications"
    description="Manage OAuth 2.0/OIDC applications, client credentials, and user consent"
    icon={<Shield className="size-5" />}
  />
  <CardLink
    href="/reference/api/object-storage"
    title="Object Storage"
    description="Store and manage files and binary objects in buckets"
    icon={<HardDrive className="size-5" />}
  />
  <CardLink
    href="/reference/api/organizations"
    title="Organizations"
    description="Manage organizations, environment variables, and org-level resources"
    icon={<Building className="size-5" />}
  />
  <CardLink
    href="/reference/api/projects"
    title="Projects"
    description="Full project lifecycle management including deployments, agents, environment variables, and hostnames"
    icon={<FolderKanban className="size-5" />}
  />
  <CardLink
    href="/reference/api/regions"
    title="Regions"
    description="List available cloud regions and manage per-region resources"
    icon={<Globe className="size-5" />}
  />
  <CardLink
    href="/reference/api/sandboxes"
    title="Sandboxes"
    description="Create and manage isolated execution environments with full lifecycle, file system, snapshot, and checkpoint support"
    icon={<Box className="size-5" />}
  />
  <CardLink
    href="/reference/api/schedules"
    title="Schedules"
    description="Create and manage cron-based scheduled jobs with destinations and delivery tracking"
    icon={<Clock className="size-5" />}
  />
  <CardLink
    href="/reference/api/sessions"
    title="Sessions"
    description="View agent execution sessions with timing, cost, and observability data"
    icon={<Timer className="size-5" />}
  />
  <CardLink
    href="/reference/api/tasks"
    title="Tasks"
    description="Full-featured task management with epics, features, bugs, comments, tags, attachments, and activity tracking"
    icon={<ListTodo className="size-5" />}
  />
  <CardLink
    href="/reference/api/threads"
    title="Threads"
    description="Manage conversation threads for agent session state and user data"
    icon={<MessageSquare className="size-5" />}
  />
  <CardLink
    href="/reference/api/user"
    title="User"
    description="Get authenticated user information and organization memberships"
    icon={<User className="size-5" />}
  />
  <CardLink
    href="/reference/api/vector"
    title="Vector Search"
    description="Semantic search with automatic embedding generation"
    icon={<Search className="size-5" />}
  />
  <CardLink
    href="/reference/api/webhooks"
    title="Webhooks"
    description="Manage webhook endpoints, destinations, receipts, deliveries, and analytics"
    icon={<Webhook className="size-5" />}
  />
</Cards>`;
}

function renderServiceRoute(service: Service): string {
	return `import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/${service.slug}')({
	component: () => <MDXPage route="reference/api/${service.slug}" />,
	staticData: { crumb: '${service.name}' },
});`;
}

function renderApiIndexRoute(): string {
	return `import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/')({
	component: () => <MDXPage route="reference/api" />,
	staticData: { crumb: 'API Reference' },
});`;
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
