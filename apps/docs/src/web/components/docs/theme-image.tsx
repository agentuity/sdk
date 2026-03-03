'use client';

import { useTheme } from '../ThemeContext.tsx';
import { useState, useEffect } from 'react';
import Zoom from 'react-medium-image-zoom';
import 'react-medium-image-zoom/dist/styles.css';

// Theme-aware styles for zoom modal
const zoomOverlayStyles = `
	/* Theme-aware overlay background */
	[data-rmiz-modal-overlay="visible"] {
		background-color: rgba(255, 255, 255, 0.9);
	}
	.dark [data-rmiz-modal-overlay="visible"] {
		background-color: rgba(9, 9, 11, 0.9);
	}

	/* Rounded corners and shadow on zoomed image */
	[data-rmiz-modal-img] {
		border-radius: 12px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
	}
	.dark [data-rmiz-modal-img] {
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}

	/* Style the unzoom button */
	[data-rmiz-btn-unzoom] {
		background: rgba(0, 0, 0, 0.6);
		border-radius: 9999px;
		padding: 8px;
		cursor: pointer;
	}
	[data-rmiz-btn-unzoom]:hover {
		background: rgba(0, 0, 0, 0.8);
	}
	[data-rmiz-btn-unzoom] svg {
		color: white;
	}
`;

interface ThemeImageProps {
	baseName: string;
	alt: string;
	width?: number;
	height?: number;
	className?: string;
}

export function ThemeImage({ baseName, alt, width, height, className }: ThemeImageProps) {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	if (!mounted) {
		return (
			<div
				style={{ width, height }}
				className="bg-zinc-200 dark:bg-zinc-800 animate-pulse rounded-lg"
			/>
		);
	}

	const src = `/public/images/${baseName}-${resolvedTheme === 'dark' ? 'dark' : 'light'}.png`;

	return (
		<>
			<style>{zoomOverlayStyles}</style>
			<Zoom zoomMargin={40}>
				<img
					src={src}
					alt={alt}
					width={width}
					height={height}
					className={className ?? 'rounded-lg'}
				/>
			</Zoom>
		</>
	);
}
