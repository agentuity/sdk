import { useMemo } from 'react';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

const getLogLevel = (): LogLevel | null => {
	try {
		const level = localStorage.getItem('AGENTUITY_LOG_LEVEL');

		if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
			return level as LogLevel;
		}

		return null;
	} catch {
		return null;
	}
};

const shouldLog = (messageLevel: LogLevel): boolean => {
	const currentLevel = getLogLevel();

	if (!currentLevel) return false;

	const levels: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	return levels[messageLevel] >= levels[currentLevel];
};

export function useLogger(component?: string): Logger {
	// Memoize the entire logger object to prevent re-render loops
	// when logger is used as a dependency in useCallback/useEffect
	return useMemo(() => {
		const createLogFunction =
			(level: LogLevel) =>
			(...args: unknown[]) => {
				if (!shouldLog(level)) {
					return;
				}

				const prefix = component ? `[${component}]` : '[Workbench]';
				const consoleFn = console[level] || console.log;

				consoleFn(prefix, ...args);
			};

		return {
			debug: createLogFunction('debug'),
			info: createLogFunction('info'),
			warn: createLogFunction('warn'),
			error: createLogFunction('error'),
		};
	}, [component]);
}
