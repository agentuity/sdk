export * from './agent';
export * from './app';
export * from './devmode';
export * from './router';
export * from './eval';
export * from './session';
export * from './workbench';
export type { Logger } from './logger';
export { getRouter, getAppState } from './_server';
export { Email, parseEmail } from './io/email';
export * from './services/evalrun';
export { getEvalRunEventProvider, getThreadProvider, getSessionProvider } from './_services';

/**
 * Default AppState interface that can be augmented by the build tool
 * to provide app-level state typing throughout the application.
 *
 * This will be extended by the auto-generated .agentuity_runtime.ts wrapper
 * when the app defines a setup() function in createApp().
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppState {}
