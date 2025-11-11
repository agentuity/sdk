import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.email('test-plaintext@example.com', async (email, _c) => {
	const from = email.fromEmail() ?? 'unknown';
	const subject = email.subject() ?? 'no subject';
	const text = email.text() ?? '';

	console.log(
		`[Plain Text Email] From: ${from}, Subject: ${subject}, Body length: ${text.length}`
	);
});

router.email('test-html@example.com', async (email, c) => {
	const from = email.fromEmail() ?? 'unknown';
	const subject = email.subject() ?? 'no subject';
	const html = email.html() ?? '';
	const text = email.text() ?? '';

	console.log(
		`[HTML Email] From: ${from}, Subject: ${subject}, HTML length: ${html.length}, Text length: ${text.length}`
	);

	return c.text(`Processed HTML email from ${from} with subject "${subject}"`);
});

router.email('test-mixed@example.com', async (email, c) => {
	const from = email.fromEmail() ?? 'unknown';
	const subject = email.subject() ?? 'no subject';
	const attachments = email.attachments();
	const text = email.text() ?? '';
	const html = email.html() ?? '';

	console.log(
		`[Mixed Email] From: ${from}, Subject: ${subject}, Attachments: ${attachments.length}`
	);

	return c.json({
		status: 'processed',
		from,
		subject,
		hasText: text.length > 0,
		hasHtml: html.length > 0,
		attachmentCount: attachments.length,
		attachments: attachments.map((att) => ({
			filename: att.filename,
			contentType: att.contentType,
		})),
	});
});

router.email('test-custom-response@example.com', async (email, c) => {
	const text = await c.agent.email.run({
		from: email.fromEmail() ?? 'unknown',
		message: email.text() ?? '',
	});
	return c.text(text);
});

export default router;
