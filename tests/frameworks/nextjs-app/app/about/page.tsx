import Link from 'next/link';

export default function About() {
	return (
		<main className="page">
			<h1>About</h1>
			<p>A plain Next.js app deployed through the Agentuity buildpack pipeline.</p>
			<Link href="/">Home</Link>
		</main>
	);
}
