import { type MotionProps, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
	const MotionComponent = useMemo(
		() => motion.create(Component, { forwardMotionProps: true }),
		[Component]
	);

	const [displayedText, setDisplayedText] = useState<string>('');
	const [started, setStarted] = useState(false);
	const elementRef = useRef<HTMLElement | null>(null);
	const onCompleteRef = useRef(onComplete);
	const hasCompletedRef = useRef(false);

	// Reset animation state when children changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: children is used as a trigger to reset animation state
	useEffect(() => {
		hasCompletedRef.current = false;
		setDisplayedText('');
	}, [children]);

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

		let viewTimeout: ReturnType<typeof setTimeout> | null = null;

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting) {
					viewTimeout = setTimeout(() => {
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

		return () => {
			observer.disconnect();
			if (viewTimeout) clearTimeout(viewTimeout);
		};
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
