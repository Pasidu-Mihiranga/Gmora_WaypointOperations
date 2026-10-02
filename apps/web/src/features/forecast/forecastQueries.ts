import { useQuery } from '@tanstack/react-query'
import { api, apiReadError } from '../../lib/apiClient'
import type { components } from '../../generated/api'

type Present<T> = T extends (infer U)[] ? Present<U>[]
  : T extends object ? { [K in keyof T]-?: Present<NonNullable<T[K]>> | Extract<T[K], null> } : T
export type DemandForecast = Present<components['schemas']['DemandForecast']>

/**
 * Advisory demand outlook for one depot. The server computes every figure from observed history;
 * the screen only formats them and never derives a capacity verdict of its own.
 */
export function useDemandForecast(depot?: string, horizonWeeks?: number) {
  return useQuery({
    queryKey: ['dispatcher', 'forecast', 'demand', depot, horizonWeeks ?? 'default'],
    enabled: Boolean(depot),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/dispatcher/forecast/demand', {
        params: { query: { depot: depot!, horizonWeeks } },
      })
      if (error || !data) throw apiReadError(response, 'Demand forecast could not be loaded')
      return data as DemandForecast
    },
    retry: false,
  })
}
