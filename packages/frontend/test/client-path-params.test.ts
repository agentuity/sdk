import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createClient } from '../src/client/index';

describe('Client path params', () => {
	let originalFetch: typeof globalThis.fetch;
	let capturedUrl: string | undefined;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		globalThis.fetch = async (url, _init) => {
			capturedUrl = url instanceof Request ? url.url : url.toString();
			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		};
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe('path parameter substitution', () => {
		test('should substitute single path parameter as positional arg', async () => {
			interface TestRegistry {
				users: {
					id: {
						get: {
							input: never;
							output: { id: string; name: string };
							type: 'api';
							params: { id: string };
							paramsTuple: [string];
						};
					};
				};
			}

			const metadata = {
				users: {
					id: {
						get: { type: 'api', path: '/api/users/:id', pathParams: ['id'] },
					},
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			// Positional argument API
			await client.users.id.get('123');

			expect(capturedUrl).toBe('http://localhost:3000/api/users/123');
		});

		test('should substitute single path parameter with primitive number', async () => {
			interface TestRegistry {
				posts: {
					postId: {
						get: {
							input: never;
							output: { id: number; title: string };
							type: 'api';
							params: { postId: string };
							paramsTuple: [string];
						};
					};
				};
			}

			const metadata = {
				posts: {
					postId: {
						get: { type: 'api', path: '/api/posts/:postId', pathParams: ['postId'] },
					},
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			// Positional argument API with number (converted to string)
			await client.posts.postId.get(42);

			expect(capturedUrl).toBe('http://localhost:3000/api/posts/42');
		});

		test('should substitute multiple path parameters as positional args', async () => {
			interface TestRegistry {
				organizations: {
					orgId: {
						members: {
							memberId: {
								delete: {
									input: never;
									output: void;
									type: 'api';
									params: { orgId: string; memberId: string };
									paramsTuple: [string, string];
								};
							};
						};
					};
				};
			}

			const metadata = {
				organizations: {
					orgId: {
						members: {
							memberId: {
								delete: {
									type: 'api',
									path: '/api/organizations/:orgId/members/:memberId',
									pathParams: ['orgId', 'memberId'],
								},
							},
						},
					},
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			// Positional arguments in order
			await client.organizations.orgId.members.memberId.delete('org-456', 'user-789');

			expect(capturedUrl).toBe(
				'http://localhost:3000/api/organizations/org-456/members/user-789'
			);
		});

		test('should URL-encode positional path parameter values', async () => {
			interface TestRegistry {
				files: {
					path: {
						get: {
							input: never;
							output: { content: string };
							type: 'api';
							params: { path: string };
							paramsTuple: [string];
						};
					};
				};
			}

			const metadata = {
				files: {
					path: {
						get: { type: 'api', path: '/api/files/:path', pathParams: ['path'] },
					},
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			// Positional argument with special characters
			await client.files.path.get('folder/file name.txt');

			expect(capturedUrl).toBe('http://localhost:3000/api/files/folder%2Ffile%20name.txt');
		});

		test('should throw error when path parameter is missing', () => {
			interface TestRegistry {
				users: {
					id: {
						get: {
							input: never;
							output: { id: string; name: string };
							type: 'api';
							params: { id: string };
							paramsTuple: [string];
						};
					};
				};
			}

			const metadata = {
				users: {
					id: {
						get: { type: 'api', path: '/api/users/:id', pathParams: ['id'] },
					},
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			// @ts-expect-error - intentionally calling without required param
			expect(() => client.users.id.get()).toThrow(
				"Missing required path parameter 'id' at position 1"
			);
		});

		test('should throw error when one of multiple path parameters is missing', () => {
			interface TestRegistry {
				organizations: {
					orgId: {
						members: {
							memberId: {
								get: {
									input: never;
									output: void;
									type: 'api';
									params: { orgId: string; memberId: string };
									paramsTuple: [string, string];
								};
							};
						};
					};
				};
			}

			const metadata = {
				organizations: {
					orgId: {
						members: {
							memberId: {
								get: {
									type: 'api',
									path: '/api/organizations/:orgId/members/:memberId',
									pathParams: ['orgId', 'memberId'],
								},
							},
						},
					},
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			// @ts-expect-error - intentionally calling with only one param
			expect(() => client.organizations.orgId.members.memberId.get('org-123')).toThrow(
				"Missing required path parameter 'memberId' at position 2"
			);
		});
	});

	describe('query parameters', () => {
		test('should append query parameters to URL', async () => {
			interface TestRegistry {
				users: {
					get: {
						input: never;
						output: { users: unknown[] };
						type: 'api';
						params: never;
					};
				};
			}

			const metadata = {
				users: {
					get: { type: 'api', path: '/api/users' },
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			await client.users.get({ query: { page: '1', limit: '10' } });

			expect(capturedUrl).toBe('http://localhost:3000/api/users?page=1&limit=10');
		});

		test('should combine path params and query params', async () => {
			interface TestRegistry {
				organizations: {
					orgId: {
						members: {
							get: {
								input: never;
								output: { members: unknown[] };
								type: 'api';
								params: { orgId: string };
								paramsTuple: [string];
							};
						};
					};
				};
			}

			const metadata = {
				organizations: {
					orgId: {
						members: {
							get: {
								type: 'api',
								path: '/api/organizations/:orgId/members',
								pathParams: ['orgId'],
							},
						},
					},
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			// Positional path param + options object with query
			await client.organizations.orgId.members.get('org-123', { query: { role: 'admin' } });

			expect(capturedUrl).toBe(
				'http://localhost:3000/api/organizations/org-123/members?role=admin'
			);
		});
	});

	describe('input with path params', () => {
		test('should send body with path params for POST requests', async () => {
			let capturedBody: string | undefined;

			globalThis.fetch = async (url, init) => {
				capturedUrl = url instanceof Request ? url.url : url.toString();
				capturedBody = init?.body as string;
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				users: {
					id: {
						posts: {
							post: {
								input: { title: string; content: string };
								output: { postId: string };
								type: 'api';
								params: { id: string };
								paramsTuple: [string];
							};
						};
					};
				};
			}

			const metadata = {
				users: {
					id: {
						posts: {
							post: {
								type: 'api',
								path: '/api/users/:id/posts',
								pathParams: ['id'],
							},
						},
					},
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			// Positional path param + options object with input
			await client.users.id.posts.post('user-123', {
				input: { title: 'Hello', content: 'World' },
			});

			expect(capturedUrl).toBe('http://localhost:3000/api/users/user-123/posts');
			expect(capturedBody).toBe('{"title":"Hello","content":"World"}');
		});
	});

	describe('backward compatibility', () => {
		test('should accept direct input for routes without path params', async () => {
			let capturedBody: string | undefined;

			globalThis.fetch = async (url, init) => {
				capturedUrl = url instanceof Request ? url.url : url.toString();
				capturedBody = init?.body as string;
				return new Response(JSON.stringify({ greeting: 'Hello!' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				hello: {
					post: {
						input: { name: string };
						output: { greeting: string };
						type: 'api';
						params: never;
					};
				};
			}

			const metadata = {
				hello: {
					post: { type: 'api', path: '/api/hello' },
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			await client.hello.post({ name: 'World' });

			expect(capturedUrl).toBe('http://localhost:3000/api/hello');
			expect(capturedBody).toBe('{"name":"World"}');
		});

		test('should accept options object with input property', async () => {
			let capturedBody: string | undefined;

			globalThis.fetch = async (url, init) => {
				capturedUrl = url instanceof Request ? url.url : url.toString();
				capturedBody = init?.body as string;
				return new Response(JSON.stringify({ greeting: 'Hello!' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			};

			interface TestRegistry {
				hello: {
					post: {
						input: { name: string };
						output: { greeting: string };
						type: 'api';
						params: never;
					};
				};
			}

			const metadata = {
				hello: {
					post: { type: 'api', path: '/api/hello' },
				},
			};

			const client = createClient<TestRegistry>({ baseUrl: 'http://localhost:3000' }, metadata);

			await client.hello.post({ input: { name: 'World' }, query: { debug: 'true' } });

			expect(capturedUrl).toBe('http://localhost:3000/api/hello?debug=true');
			expect(capturedBody).toBe('{"name":"World"}');
		});
	});
});
