import { StructuredError } from '@agentuity/core';

export const WebhookError = StructuredError('WebhookError')<{ webhookId?: string }>();

export const WebhookNotFoundError = StructuredError('WebhookNotFoundError')<{
	webhookId: string;
}>();

export const WebhookDestinationNotFoundError = StructuredError('WebhookDestinationNotFoundError')<{
	webhookId: string;
	destinationId: string;
}>();

export const WebhookReceiptNotFoundError = StructuredError('WebhookReceiptNotFoundError')<{
	webhookId: string;
	receiptId: string;
}>();

export const WebhookDeliveryNotFoundError = StructuredError('WebhookDeliveryNotFoundError')<{
	webhookId: string;
	deliveryId: string;
}>();
