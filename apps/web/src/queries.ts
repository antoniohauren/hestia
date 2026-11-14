import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call, type OrderDetail } from './api';

export const useMenu = (all = false) =>
  useQuery({
    queryKey: ['menu', all],
    queryFn: () => call(api.menu.$get({ query: all ? { all: '1' } : {} })),
    staleTime: 60_000,
  });

export const useOrder = (id: number) =>
  useQuery({ queryKey: ['order', id], queryFn: () => call(api.orders[':id'].$get({ param: { id: String(id) } })) });

/** Mutation that returns the fresh order detail and refreshes caches. */
export function useOrderMutation<V>(id: number, fn: (vars: V) => Promise<OrderDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (order) => {
      qc.setQueryData(['order', id], order);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
