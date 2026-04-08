/**
 * WebSocket close codes for the Coder Hub.
 *
 * These codes use the 4xxx private range defined by RFC 6455, allowing
 * application-specific close reasons that trigger terminal disconnection
 * (no automatic reconnect).
 *
 * @module coder/close-codes
 *
 * @example
 * ```typescript
 * import { CODER_WS_CLOSE_CODE, isTerminalCloseCode } from '@agentuity/core/coder';
 *
 * // Check if a close code is terminal (should not reconnect)
 * if (isTerminalCloseCode(4401)) {
 *   console.log('Auth failed, will not reconnect');
 * }
 *
 * // Use close codes when closing connections
 * client.close(CODER_WS_CLOSE_CODE.AUTH_REQUIRED, 'Invalid API key');
 * ```
 */

/**
 * Application-defined WebSocket close codes for the Coder Hub.
 *
 * These codes indicate specific error conditions that should not trigger
 * automatic reconnection. The 4xxx range is reserved for application use
 * per RFC 6455.
 */
export const CODER_WS_CLOSE_CODE = {
	/** Invalid request parameters (4000 range equivalent) */
	BAD_REQUEST: 4400,
	/** Authentication required or credentials invalid */
	AUTH_REQUIRED: 4401,
	/** Authenticated but not authorized for this resource */
	FORBIDDEN: 4403,
	/** The requested session does not exist */
	SESSION_NOT_FOUND: 4404,
	/** Service temporarily unavailable */
	UNAVAILABLE: 4408,
	/** Session already has an active lead connection */
	SESSION_ACTIVE: 4409,
	/** Reconnecting driver with stale instance ID */
	STALE_DRIVER: 4410,
	/** Rate limit exceeded */
	RATE_LIMITED: 4429,
	/** Internal server error */
	INTERNAL_ERROR: 4500,
} as const;

/**
 * Union type of all valid Coder Hub WebSocket close codes.
 */
export type CoderWsCloseCode = (typeof CODER_WS_CLOSE_CODE)[keyof typeof CODER_WS_CLOSE_CODE];

/**
 * Determines if a close code indicates a terminal error that should not
 * trigger automatic reconnection.
 *
 * Close codes in the 4000-4999 range are application-defined terminal errors.
 * The WebSocket client should NOT attempt to reconnect when receiving these codes.
 *
 * @param code - The WebSocket close code to check
 * @returns `true` if the code indicates a terminal error, `false` otherwise
 *
 * @example
 * ```typescript
 * client.onClose((code, reason) => {
 *   if (isTerminalCloseCode(code)) {
 *     console.log('Terminal error, will not reconnect:', reason);
 *   } else {
 *     console.log('Transient error, will attempt reconnect');
 *   }
 * });
 * ```
 */
export function isTerminalCloseCode(code: number): boolean {
	return code >= 4000 && code < 5000;
}
