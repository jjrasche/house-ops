import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useHousehold() {
  const [householdId, setHouseholdId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchHouseholdId() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Failed to fetch household:', error.message)
      } else {
        setHouseholdId(data.household_id)
      }
      setIsLoading(false)
    }

    fetchHouseholdId()
  }, [])

  return { householdId, isLoading }
}
