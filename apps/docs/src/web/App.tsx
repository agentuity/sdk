import { RouterProvider } from '@tanstack/react-router';
import { router } from './Router';

export function App() {
	return <RouterProvider router={router} />;
}
