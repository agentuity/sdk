// This is a React Server Component (no 'use client' directive)
import EchoDemo from './EchoDemo';

export default function App() {
	// This component runs on the server only.
	// It renders server-side data and passes it to client components.
	return (
		<main>
			<EchoDemo />
		</main>
	);
}
