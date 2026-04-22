import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/about')({ component: AboutPage });

function AboutPage() {
	return (
		<div className="flex min-h-screen justify-center font-sans text-white">
			<div className="flex w-full max-w-3xl flex-col gap-4 p-16">
				<div className="rounded-lg border border-gray-900 bg-black p-8">
					<h1 className="mb-4 text-3xl font-thin text-white">About</h1>
					<p className="mb-4 text-gray-400">
						This is a TanStack Start app running on Agentuity. It demonstrates AI SDK
						integration through the Agentuity AI Gateway.
					</p>
					<Link to="/" className="text-cyan-500 transition-colors hover:text-cyan-400">
						← Back to home
					</Link>
				</div>
			</div>
		</div>
	);
}
