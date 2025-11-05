import { describe, test, expect } from 'bun:test';
import { parseEmail, Email } from '../src/io/email';
import { createRouter } from '../src/router';
import { hash } from '../src/_util';
import { Hono } from 'hono';

describe('Email Router', () => {
	describe('parseEmail', () => {
		test('should parse a simple RFC822 email', async () => {
			const rfc822Message = `From: sender@example.com
To: recipient@example.com
Subject: Test Email
Date: Mon, 1 Nov 2025 12:00:00 +0000
Content-Type: text/plain

This is a test email body.`;

			const buffer = Buffer.from(rfc822Message);
			const email = await parseEmail(buffer);

			expect(email).toBeInstanceOf(Email);
			expect(email.subject()).toBe('Test Email');
			expect(email.fromEmail()).toBe('sender@example.com');
			expect(email.text()).toContain('This is a test email body.');
		});

		test('should parse email with HTML body', async () => {
			const rfc822Message = `From: sender@example.com
To: recipient@example.com
Subject: HTML Email
Content-Type: text/html

<html><body><h1>Hello</h1></body></html>`;

			const buffer = Buffer.from(rfc822Message);
			const email = await parseEmail(buffer);

			expect(email.subject()).toBe('HTML Email');
			expect(email.html()).toContain('<h1>Hello</h1>');
		});

		test('should handle email with no subject', async () => {
			const rfc822Message = `From: sender@example.com
To: recipient@example.com
Content-Type: text/plain

Body without subject.`;

			const buffer = Buffer.from(rfc822Message);
			const email = await parseEmail(buffer);

			expect(email.subject()).toBeNull();
			expect(email.text()).toContain('Body without subject.');
		});

		test('should reject invalid input without headers', async () => {
			const simpleMessage = Buffer.from('This is not a valid RFC822 message');

			await expect(parseEmail(simpleMessage)).rejects.toThrow('Failed to parse email');
		});

		test('should reject corrupted binary buffer', async () => {
			const corruptedBuffer = Buffer.from([0xff, 0xfe, 0xfd, 0xfc]);

			await expect(parseEmail(corruptedBuffer)).rejects.toThrow('Failed to parse email');
		});

		test('should reject empty buffer', async () => {
			const emptyBuffer = Buffer.from([]);

			await expect(parseEmail(emptyBuffer)).rejects.toThrow('Failed to parse email');
		});
	});

	describe('Email class', () => {
		test('should provide access to email properties', async () => {
			const rfc822Message = `From: John Doe <john@example.com>
To: Jane Smith <jane@example.com>
Subject: Meeting Tomorrow
Date: Mon, 1 Nov 2025 12:00:00 +0000
Message-ID: <12345@example.com>
Content-Type: text/plain

Let's meet tomorrow at 10am.`;

			const buffer = Buffer.from(rfc822Message);
			const email = await parseEmail(buffer);

			expect(email.fromEmail()).toBe('john@example.com');
			expect(email.fromName()).toBe('John Doe');
			expect(email.toEmail()).toBe('jane@example.com');
			expect(email.subject()).toBe('Meeting Tomorrow');
			expect(email.messageId()).toBe('<12345@example.com>');
			expect(email.text()).toContain("Let's meet tomorrow at 10am.");
		});

		test('should return empty array for no attachments', async () => {
			const rfc822Message = `From: sender@example.com
To: recipient@example.com
Subject: No Attachments
Content-Type: text/plain

Simple email.`;

			const buffer = Buffer.from(rfc822Message);
			const email = await parseEmail(buffer);

			expect(email.attachments()).toEqual([]);
		});

		test('should have toString method', async () => {
			const rfc822Message = `From: sender@example.com
To: recipient@example.com
Subject: Test
Message-ID: <abc123@example.com>
Content-Type: text/plain

Body.`;

			const buffer = Buffer.from(rfc822Message);
			const email = await parseEmail(buffer);

			const str = email.toString();
			expect(str).toContain('Email');
			expect(str).toContain('sender@example.com');
			expect(str).toContain('Test');
		});
	});

	describe('Email router integration', () => {
		test('should reject requests without message/rfc822 content-type', async () => {
			const app = new Hono();
			const router = createRouter({
				agent: {
					id: 'test-agent',
					name: 'Test Agent',
					projectId: 'test-project',
				},
			});

			const emailAddress = 'test@example.com';
			router.email(emailAddress, async (email, c) => {
				return c.text('OK');
			});

			app.route('/', router);

			const id = hash(emailAddress);
			const req = new Request(`http://localhost:3000/${id}`, {
				method: 'POST',
				headers: {
					'content-type': 'text/plain',
				},
				body: 'Not an email',
			});

			const res = await app.fetch(req);
			expect(res.status).toBe(400);
			const text = await res.text();
			expect(text).toContain('message/rfc822');
		});

		test('should parse email and pass to handler', async () => {
			const app = new Hono();
			const router = createRouter({
				agent: {
					id: 'test-agent',
					name: 'Test Agent',
					projectId: 'test-project',
				},
			});

			let receivedEmail: Email | null = null;

			const emailAddress = 'test@example.com';
			router.email(emailAddress, async (email, c) => {
				receivedEmail = email;
				return c.text('OK');
			});

			app.route('/', router);

			const rfc822Message = `From: sender@example.com
To: test@example.com
Subject: Test Email
Content-Type: text/plain

Test body.`;

			const id = hash(emailAddress);
			const req = new Request(`http://localhost:3000/${id}`, {
				method: 'POST',
				headers: {
					'content-type': 'message/rfc822',
				},
				body: rfc822Message,
			});

			const res = await app.fetch(req);
			expect(res.status).toBe(200);
			expect(receivedEmail).not.toBeNull();
			expect(receivedEmail?.subject()).toBe('Test Email');
			expect(receivedEmail?.fromEmail()).toBe('sender@example.com');
		});

		test('should return error status when parseEmail throws', async () => {
			const app = new Hono();
			const router = createRouter({
				agent: {
					id: 'test-agent',
					name: 'Test Agent',
					projectId: 'test-project',
				},
			});

			const emailAddress = 'test@example.com';
			router.email(emailAddress, async (email, c) => {
				return c.text('OK');
			});

			app.route('/', router);

			const corruptedBody = Buffer.from([0xff, 0xfe, 0xfd, 0xfc]);
			const id = hash(emailAddress);
			const req = new Request(`http://localhost:3000/${id}`, {
				method: 'POST',
				headers: {
					'content-type': 'message/rfc822',
				},
				body: corruptedBody,
			});

			const res = await app.fetch(req);
			expect(res.status).toBe(500);
		});
	});
});
