import type { Service } from './framework.ts';

import aiGatewayService from '../../../packages/aigateway/src/api-reference.ts';
import apiKeysService from '../../../packages/server/src/api-reference/apikey.ts';
import coderService from '../../../packages/coder/src/api-reference.ts';
import databaseService from '../../../packages/db/src/api-reference.ts';
import emailService from '../../../packages/email/src/api-reference.ts';
import kvService from '../../../packages/keyvalue/src/api-reference.ts';
import machinesService from '../../../packages/server/src/api-reference/machine.ts';
import oauthService from '../../../packages/server/src/api-reference/oauth.ts';
import organizationsService from '../../../packages/server/src/api-reference/org.ts';
import projectsService from '../../../packages/server/src/api-reference/project.ts';
import queuesService from '../../../packages/server/src/api-reference/queue.ts';
import regionService from '../../../packages/server/src/api-reference/region.ts';
import sandboxesService from '../../../packages/sandbox/src/api-reference.ts';
import schedulesService from '../../../packages/schedule/src/api-reference.ts';
import sessionsService from '../../../packages/server/src/api-reference/session.ts';
import objectStorageService from '../../../packages/server/src/api-reference/storage.ts';
import streamsService from '../../../packages/server/src/api-reference/stream.ts';
import tasksService from '../../../packages/task/src/api-reference.ts';
import threadService from '../../../packages/server/src/api-reference/thread.ts';
import userService from '../../../packages/server/src/api-reference/user.ts';
import vectorService from '../../../packages/vector/src/api-reference.ts';
import webhooksService from '../../../packages/server/src/api-reference/webhook.ts';
import workflowsService from '../../../packages/server/src/api-reference/workflow.ts';

export interface ApiReferenceRegistryEntry {
	service: Service;
	icon: string;
	routeTitle: string;
}

export const apiReferenceRegistry = [
	{
		service: aiGatewayService,
		icon: 'Cpu',
		routeTitle: 'AI Gateway',
	},
	{
		service: apiKeysService,
		icon: 'Key',
		routeTitle: 'API Keys',
	},
	{
		service: coderService,
		icon: 'BrainCircuit',
		routeTitle: 'Coder',
	},
	{
		service: databaseService,
		icon: 'Table',
		routeTitle: 'Database',
	},
	{
		service: streamsService,
		icon: 'Activity',
		routeTitle: 'Durable Streams',
	},
	{
		service: emailService,
		icon: 'Mail',
		routeTitle: 'Email',
	},
	{
		service: kvService,
		icon: 'Database',
		routeTitle: 'Key-Value Storage',
	},
	{
		service: machinesService,
		icon: 'Server',
		routeTitle: 'Machines',
	},
	{
		service: queuesService,
		icon: 'Layers',
		routeTitle: 'Message Queues',
	},
	{
		service: oauthService,
		icon: 'Shield',
		routeTitle: 'OAuth Applications',
	},
	{
		service: objectStorageService,
		icon: 'HardDrive',
		routeTitle: 'Object Storage',
	},
	{
		service: organizationsService,
		icon: 'Building',
		routeTitle: 'Organizations',
	},
	{
		service: projectsService,
		icon: 'FolderKanban',
		routeTitle: 'Projects',
	},
	{
		service: regionService,
		icon: 'Globe',
		routeTitle: 'Regions',
	},
	{
		service: sandboxesService,
		icon: 'Box',
		routeTitle: 'Sandboxes',
	},
	{
		service: schedulesService,
		icon: 'Clock',
		routeTitle: 'Schedules',
	},
	{
		service: sessionsService,
		icon: 'Timer',
		routeTitle: 'Sessions',
	},
	{
		service: tasksService,
		icon: 'ListTodo',
		routeTitle: 'Tasks',
	},
	{
		service: threadService,
		icon: 'MessageSquare',
		routeTitle: 'Threads',
	},
	{
		service: userService,
		icon: 'User',
		routeTitle: 'User',
	},
	{
		service: vectorService,
		icon: 'Search',
		routeTitle: 'Vector Search',
	},
	{
		service: webhooksService,
		icon: 'Webhook',
		routeTitle: 'Webhooks',
	},
	{
		service: workflowsService,
		icon: 'Workflow',
		routeTitle: 'Workflows',
	},
] satisfies ApiReferenceRegistryEntry[];

export const apiReferenceServices: Service[] = apiReferenceRegistry.map((entry) => entry.service);
