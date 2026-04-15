import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queueApi, QueueConflictError } from '../../api/queue';
import type { AppointmentSlot } from '../../types/clinical';

const QUEUE_KEY = ['liveQueue'];

export const useLiveQueue = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUEUE_KEY,
    queryFn: queueApi.fetchQueue,
    refetchInterval: 3000, // Poll every 3s to simulate live queue updates
  });

  const patchMutation = useMutation({
    mutationFn: async ({ encounterId, phase, version }: { encounterId: string; phase: string; version: number }) => {
      await queueApi.patchQueueSlot(encounterId, phase, version);
    },
    onMutate: async ({ encounterId, phase }) => {
      await queryClient.cancelQueries({ queryKey: QUEUE_KEY });
      const previousQueue = queryClient.getQueryData<AppointmentSlot[]>(QUEUE_KEY);
      queryClient.setQueryData<AppointmentSlot[]>(QUEUE_KEY, (old) => {
        if (!old) return old;
        return old.map(slot => 
          slot.id === encounterId 
            ? { ...slot, lifecycleStatus: phase as any } 
            : slot
        );
      });
      return { previousQueue };
    },
    onError: (err: any, variables, context) => {
      if (context?.previousQueue) {
        queryClient.setQueryData(QUEUE_KEY, context.previousQueue);
      }
      if (err instanceof QueueConflictError || err.name === 'QueueConflictError') {
        console.error(`QUEUE CONFLICT [409]: Reversing optimistic update for encounter ${variables.encounterId}`);
        alert("Queue Conflict: Another session modified this state. Your action has been reverted to protect data integrity. Please review current state.");
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    }
  });

  return {
    queue: (query.data || []) as AppointmentSlot[],
    isLoading: query.isLoading,
    isError: query.isError,
    refetchQueue: query.refetch,
    updateSlotStatus: (encounterId: string, phase: string, version: number) => 
      patchMutation.mutate({ encounterId, phase, version })
  };
};
