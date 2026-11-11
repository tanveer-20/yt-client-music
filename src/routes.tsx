import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/shell/AppShell';
import { RouteError } from '@/components/common/ErrorBoundary';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('@/pages/Home')).default }),
      },
      {
        path: 'search',
        lazy: async () => ({ Component: (await import('@/pages/Search')).default }),
      },
      {
        path: 'album/:id',
        lazy: async () => ({ Component: (await import('@/pages/Album')).default }),
      },
      {
        path: 'artist/:id',
        lazy: async () => ({ Component: (await import('@/pages/Artist')).default }),
      },
      {
        path: 'playlist/:id',
        lazy: async () => ({ Component: (await import('@/pages/Playlist')).default }),
      },
      {
        path: 'library',
        lazy: async () => ({ Component: (await import('@/pages/Library')).default }),
      },
      {
        path: 'settings',
        lazy: async () => ({ Component: (await import('@/pages/Settings')).default }),
      },
      {
        path: '*',
        lazy: async () => ({ Component: (await import('@/pages/NotFound')).default }),
      },
    ],
  },
]);
