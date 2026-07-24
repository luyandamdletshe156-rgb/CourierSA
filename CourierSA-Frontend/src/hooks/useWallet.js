import { useQuery } from '@tanstack/react-query'
import { walletApi } from '@/api'
import { useAuth } from '@/context/AuthContext'

/**
 * Returns the current user's wallet balance from the API.
 * Only fetches when the user is a Customer or BusinessClient.
 * Falls back gracefully if the request fails (e.g. during demo without backend).
 */
export function useWallet() {
  const { user } = useAuth()
  const eligible  = user?.role === 'Customer' || user?.role === 'BusinessClient'

  const { data, isLoading, error } = useQuery({
    queryKey: ['wallet-balance', user?.id],
    queryFn:  () => walletApi.balance(),
    enabled:  !!user && eligible,
    staleTime: 1000 * 30,   // re-fetch after 30s
    retry: 1,
  })

  return {
    balance:   data?.data?.balanceZAR ?? 0,
    isLoading,
    error,
    available: eligible,
  }
}
