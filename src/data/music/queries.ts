import { queryOptions } from '@tanstack/react-query';
import {
  fetchAlbum,
  fetchArtist,
  fetchHome,
  fetchPlaylist,
  searchMusic,
} from './api';

export const homeQuery = () =>
  queryOptions({
    queryKey: ['home'],
    queryFn: ({ signal }) => fetchHome(signal),
    staleTime: 10 * 60 * 1000,
  });

export const searchQuery = (query: string) =>
  queryOptions({
    queryKey: ['search', query],
    queryFn: ({ signal }) => searchMusic(query, signal),
    enabled: query.trim().length > 0,
    staleTime: 5 * 60 * 1000,
  });

export const albumQuery = (id: string) =>
  queryOptions({
    queryKey: ['album', id],
    queryFn: ({ signal }) => fetchAlbum(id, signal),
    enabled: Boolean(id),
    staleTime: 30 * 60 * 1000,
  });

export const artistQuery = (id: string) =>
  queryOptions({
    queryKey: ['artist', id],
    queryFn: ({ signal }) => fetchArtist(id, signal),
    enabled: Boolean(id),
    staleTime: 30 * 60 * 1000,
  });

export const playlistQuery = (id: string) =>
  queryOptions({
    queryKey: ['playlist', id],
    queryFn: ({ signal }) => fetchPlaylist(id, signal),
    enabled: Boolean(id),
    staleTime: 15 * 60 * 1000,
  });
