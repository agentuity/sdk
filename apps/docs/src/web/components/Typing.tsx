import { type MotionProps, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { twMerge } from 'tailwind-merge';

interface TypingProps extends MotionProps {
	as?: React.ElementType;
	children: string;
	className?: string;
	delay?: number;
	duration?: number;
	startOnView?: boolean;
	onComplete?: () => void;
}

export function Typing({
	as: Component = 'div',
	children,
	className,
	delay = 0,
	duration = 100,
	startOnView = false,
	onComplete,
	...props
}: TypingProps) {
	const MotionComponent = motion.create(Component, {
		forwardMotionProps: true,
	});

	const [displayedText, setDisplayedText] = useState<string>('');
	const [started, setStarted] = useState(false);
	const elementRef = useRef<HTMLElement | null>(null);
	const onCompleteRef = useRef(onComplete);
	const hasCompletedRef = useRef(false);

	// Keep onComplete ref up to date
	useEffect(() => {
		onCompleteRef.current = onComplete;
	}, [onComplete]);

	useEffect(() => {
		if (!startOnView) {
			const startTimeout = setTimeout(() => {
				setStarted(true);
			}, delay);
			return () => clearTimeout(startTimeout);
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting) {
					setTimeout(() => {
						setStarted(true);
					}, delay);
					observer.disconnect();
				}
			},
			{ threshold: 0.1 }
		);

		if (elementRef.current) {
			observer.observe(elementRef.current);
		}

		return () => observer.disconnect();
	}, [delay, startOnView]);

	useEffect(() => {
		if (!started || hasCompletedRef.current) return;

		let i = 0;

		const typingEffect = setInterval(() => {
			if (i < children.length) {
				setDisplayedText(children.substring(0, i + 1));
				i++;
			} else {
				clearInterval(typingEffect);
				if (!hasCompletedRef.current) {
					hasCompletedRef.current = true;
					onCompleteRef.current?.();
				}
			}
		}, duration);

		return () => {
			clearInterval(typingEffect);
		};
	}, [children, duration, started]);

	return (
		<MotionComponent
			ref={elementRef}
			className={twMerge('whitespace-pre-wrap', className)}
			{...props}
		>
			{displayedText}
		</MotionComponent>
	);
}
