// This is the server component wrapper - it renders on the server.
// Client interactivity is delegated to EchoDemoClient via 'use client'.
import EchoDemoClient from './EchoDemoClient';

export default function EchoDemo() {
	return <EchoDemoClient />;
}
