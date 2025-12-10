import { useMemo } from 'react';
import type { ExternalSidebarIntegration } from '../types/config';

/**
 * Hook for integrating workbench with external sidebar systems
 * This creates the integration object needed by WorkbenchProvider
 */
export function useSidebarIntegration(sidebar: {
	open: boolean;
	setOpen: (open: boolean) => void;
	toggleSidebar?: () => void;
}): ExternalSidebarIntegration {
	return useMemo(
		() => ({
			isOpen: sidebar.open,
			setOpen: sidebar.setOpen,
			toggle: sidebar.toggleSidebar,
		}),
		[sidebar.open, sidebar.setOpen, sidebar.toggleSidebar]
	);
}
