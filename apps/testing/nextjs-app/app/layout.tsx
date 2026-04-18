import './globals.css';

export const metadata = {
	title: 'Next.js on Agentuity',
	description: 'Next.js + AI Gateway demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
