import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../../api/notifications';

const NOTIFICATIONS_KEY = ['notifications'];

export const useNotifications = () => {
  const queryClient = useQueryClient();



  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: notificationsApi.fetchNotifications,
    refetchInterval: 3000, // Poll every 3s to simulate live pushes
  });

  const mutation = useMutation({
    mutationFn: async (newNotifs: any[]) => {
      await notificationsApi.syncNotifications(newNotifs);
      return newNotifs;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    }
  });

  return {
    notifications: query.data || [],
    unreadCount: (query.data || []).filter((n: any) => !n.read).length,
    isLoading: query.isLoading,
    isError: query.isError,
    updateNotifications: (n: any[]) => mutation.mutate(n)
  };
};
