import { describe, test, expect } from 'bun:test';
import { APIClient } from '../src/api/api';
import { projectGet } from '../src/api/project/get';
import { projectList } from '../src/api/project/list';
import { createMockLogger, mockFetch } from '@agentuity/test-utils';

describe('project API', () => {
	describe('projectGet', () => {
		test('should return project details', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: true,
							data: {
								id: 'project-123',
								name: 'Test Project',
								description: 'A test project',
								tags: ['test', 'example'],
								orgId: 'org-456',
								api_key: 'masked-key',
								env: {
									NODE_ENV: 'production',
									API_URL: 'https://api.example.com',
								},
								secrets: {
									DB_PASSWORD: '****',
									API_SECRET: '****',
								},
							},
						}),
						{
							status: 200,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const project = await projectGet(client, { id: 'project-123', mask: true });

			expect(project.id).toBe('project-123');
			expect(project.orgId).toBe('org-456');
			expect(project.env?.NODE_ENV).toBe('production');
			expect(project.secrets?.DB_PASSWORD).toBe('****');
		});

		test('should request unmasked secrets when mask is false', async () => {
			mockFetch(async (url) => {
				expect(url).toContain('mask=false');
				return new Response(
					JSON.stringify({
						success: true,
						data: {
							id: 'project-123',
							name: 'Test Project',
							description: null,
							tags: null,
							orgId: 'org-456',
							secrets: {
								DB_PASSWORD: 'real-password-123',
							},
						},
					}),
					{
						status: 200,
						headers: { 'content-type': 'application/json' },
					}
				);
			});

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const project = await projectGet(client, { id: 'project-123', mask: false });

			expect(project.secrets?.DB_PASSWORD).toBe('real-password-123');
		});

		test('should throw ProjectResponseError on failure', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: false,
							message: 'Project not found',
						}),
						{
							status: 404,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await expect(projectGet(client, { id: 'missing', mask: true })).rejects.toThrow();
		});
	});

	describe('projectList', () => {
		test('should return list of projects', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: true,
							data: [
								{
									id: 'project-1',
									orgId: 'org-123',
									orgName: 'Acme Corp',
									name: 'Project One',
									latestDeploymentId: 'deploy-1',
								},
								{
									id: 'project-2',
									orgId: 'org-123',
									orgName: 'Acme Corp',
									name: 'Project Two',
									latestDeploymentId: null,
								},
							],
						}),
						{
							status: 200,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const projects = await projectList(client);

			expect(projects).toHaveLength(2);
			expect(projects[0].id).toBe('project-1');
			expect(projects[1].name).toBe('Project Two');
		});

		test('should handle empty project list', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: true,
							data: [],
						}),
						{
							status: 200,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			const projects = await projectList(client);

			expect(projects).toHaveLength(0);
		});

		test('should throw ProjectResponseError on failure', async () => {
			mockFetch(
				async () =>
					new Response(
						JSON.stringify({
							success: false,
							message: 'Organization not found',
						}),
						{
							status: 404,
							headers: { 'content-type': 'application/json' },
						}
					)
			);

			const client = new APIClient('https://api.example.com', createMockLogger(), 'test-key');

			await expect(projectList(client)).rejects.toThrow();
		});
	});
});
