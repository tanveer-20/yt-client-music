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
        path: 'account',
        lazy: async () => ({ Component: (await import('@/pages/Account')).default }),
      },
      {
        path: 'replay',
        lazy: async () => ({ Component: (await import('@/pages/Replay')).default }),
      },
      {
        path: 'listen-together',
        lazy: async () => ({ Component: (await import('@/pages/ListenTogether')).default }),
      },
      {
        path: 'integrations',
        lazy: async () => ({ Component: (await import('@/pages/Integrations')).default }),
      },
      {
        path: 'spotify',
        lazy: async () => ({ Component: (await import('@/pages/Spotify')).default }),
      },
      {
        path: 'discord',
        lazy: async () => ({ Component: (await import('@/pages/Discord')).default }),
      },
      {
        path: 'addons',
        lazy: async () => ({ Component: (await import('@/pages/Addons')).default }),
      },
      {
        path: 'extension',
        lazy: async () => ({ Component: (await import('@/pages/Extension')).default }),
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
