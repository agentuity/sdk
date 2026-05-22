import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RegionProvider } from '../../../../components/docs/api/region-context';

export const Route = createFileRoute('/_docs/reference/api')({
	component: ApiReferenceLayout,
});

function ApiReferenceLayout() {
	return (
		<RegionProvider>
			<Outlet />
		</RegionProvider>
	);
}
