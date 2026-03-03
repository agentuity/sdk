import { RouterProvider } from '@tanstack/react-router';
import { router } from './Router.tsx';

export function App() {
	return <RouterProvider router={router} />;
}
