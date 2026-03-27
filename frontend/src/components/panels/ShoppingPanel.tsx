import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface ShoppingItem {
  id: number
  name: string
  quantity_needed: number | null
  store_section: string | null
  purchased: boolean
}

interface ShoppingPanelProps {
  householdId: number
}

export function ShoppingPanel({ householdId }: ShoppingPanelProps) {
  const [items, setItems] = useState<ShoppingItem[]>([])

  useEffect(() => {
    loadShoppingItems(householdId).then(setItems)
  }, [householdId])

  if (items.length === 0) return <p className="panel__empty">No items on the list</p>

  return (
    <ul className="panel__list">
      {items.map(item => (
        <li key={item.id} className={item.purchased ? 'item--purchased' : ''}>
          <span className="item__name">{item.name}</span>
          {item.quantity_needed != null && (
            <span className="item__qty">{item.quantity_needed}</span>
          )}
          {item.store_section && (
            <span className="item__section">{item.store_section}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

async function loadShoppingItems(householdId: number): Promise<ShoppingItem[]> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select('id, name, quantity_needed, store_section, purchased')
    .eq('household_id', householdId)
    .order('purchased', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) return []
  return data ?? []
}
