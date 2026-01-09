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
			<body style={{ margin: 0, backgroundColor: '#09090b' }}>{children}</body>
		</html>
	);
}
