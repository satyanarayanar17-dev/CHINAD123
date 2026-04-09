import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../api/notifications';
import { buildSseUrl } from '../../api/config';
import { authApi } from '../../api/auth';
import { useAuth } from '../useAuth';
import type { Notification } from '../../store/mockData';

const NOTIFICATIONS_KEY = ['notifications'];

/**
 * Notifications hook with SSE for real-time delivery + polling as fallback.
 *
 * Behaviour:
 *   - Opens an EventSource to /api/v1/sse?token=<jwt> on mount.
 *   - `connected` event → sets isLive=true.
 *   - `notification` event → patches the TanStack Query cache directly (no round-trip).
 *   - `error` event → closes EventSource, sets isLive=false, falls back to 10s polling.
 *   - Polling runs at 30s while SSE is live; drops to 10s when SSE is down.
 *   - On unmount → EventSource is closed and isLive cleared.
 */
export const useNotifications = () => {
  const queryClient = useQueryClient();
  const [isLive, setIsLive] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const { status, role } = useAuth();

  useEffect(() => {
    if (status !== 'authenticated' || role === 'patient') return;

    let isCancelled = false;
    let localEs: EventSource | null = null;

    authApi.getSseToken()
      .then((token) => {
        if (isCancelled) return;

        const es = new EventSource(buildSseUrl(token));
        esRef.current = es;
        localEs = es;

        es.addEventListener('connected', () => {
          setIsLive(true);
        });

        es.addEventListener('notification', (event: MessageEvent) => {
          const incoming = JSON.parse(event.data) as Notification;
          queryClient.setQueryData<Notification[]>(NOTIFICATIONS_KEY, (old = []) => {
            if (old.some(n => n.id === incoming.id)) return old;
            return [incoming, ...old];
          });
        });

        es.addEventListener('error', () => {
          setIsLive(false);
          es.close();
          esRef.current = null;
        });
      })
      .catch(() => {
        setIsLive(false);
      });

    return () => {
      isCancelled = true;
      localEs?.close();
      esRef.current = null;
      setIsLive(false);
    };
  }, [queryClient, role, status]);

  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: notificationsApi.fetchNotifications,
    // 30s when SSE is live (SSE handles real-time); 10s fallback when SSE is down
    refetchInterval: isLive ? 30_000 : 10_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }
  });

  return {
    notifications: query.data ?? [],
    unreadCount: (query.data ?? []).filter((n: Notification) => !n.read).length,
    isLoading: query.isLoading,
    isError: query.isError,
    isLive,
    markRead: (id: string) => markReadMutation.mutate(id),
    markAllRead: () => markAllReadMutation.mutate(),
  };
};
