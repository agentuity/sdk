import type { Metadata } from 'next';

export const metadata: Metadata = {
	title: 'Agentuity + Next.js Demo',
	description: 'End-to-end type-safe Agentuity integration with Next.js',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
