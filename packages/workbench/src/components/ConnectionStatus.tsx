import React from 'react';
import type { ConnectionStatus as ConnectionStatusType } from '../types/config';

interface ConnectionStatusProps {
	status: ConnectionStatusType;
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
	if (status === 'connected') {
		return null; // Don't show anything when connected normally
	}

	const getStatusConfig = (status: ConnectionStatusType) => {
		switch (status) {
			case 'restarting':
				return {
					text: 'Server restarting...',
					bgColor: 'bg-amber-100',
					textColor: 'text-amber-800',
					borderColor: 'border-amber-200',
					icon: '🔄',
				};
			case 'disconnected':
				return {
					text: 'Disconnected from server',
					bgColor: 'bg-red-100',
					textColor: 'text-red-800',
					borderColor: 'border-red-200',
					icon: '⚠️',
				};
			case 'connected':
				return {
					text: 'Connected',
					bgColor: 'bg-green-100',
					textColor: 'text-green-800',
					borderColor: 'border-green-200',
					icon: '✅',
				};
			default:
				return {
					text: 'Unknown status',
					bgColor: 'bg-gray-100',
					textColor: 'text-gray-800',
					borderColor: 'border-gray-200',
					icon: '❓',
				};
		}
	};

	const config = getStatusConfig(status);

	return (
		<div
			className={`
				fixed top-0 left-0 right-0 z-50
				px-4 py-2
				${config.bgColor} ${config.textColor} ${config.borderColor}
				border-b
				text-center text-sm font-medium
				transition-all duration-200 ease-in-out
			`}
		>
			<span className="mr-2">{config.icon}</span>
			{config.text}
		</div>
	);
}
