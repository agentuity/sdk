import { forwardRef } from 'react';
import React from 'react';

import { cn } from '../../lib/utils';

const Logo = forwardRef<SVGSVGElement, { className?: string; alt?: string }>(
	({ className = '', alt = 'Agentuity' }, ref) => {
		return (
			<svg
				ref={ref}
				role="img"
				aria-label={alt}
				className={cn('fill-cyan-600 dark:fill-cyan-500', className)}
				width="24"
				height="22"
				viewBox="0 0 24 22"
				xmlns="http://www.w3.org/2000/svg"
			>
				<title>{alt}</title>
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="M24 21.3349H0L3.4284 15.3894H0L0.872727 13.8622H19.6909L24 21.3349ZM5.19141 15.3894L2.6437 19.8076H21.3563L18.8086 15.3894H5.19141Z"
				/>
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="M12 0.498535L17.1762 9.49853H20.6182L21.4909 11.0258H5.94545L12 0.498535ZM8.58569 9.49853L12 3.56193L15.4143 9.49853H8.58569Z"
				/>
			</svg>
		);
	}
);

Logo.displayName = 'Logo';

export default Logo;
