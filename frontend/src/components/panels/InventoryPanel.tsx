import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface InventoryItem {
  id: number
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
}

interface InventoryPanelProps {
  householdId: number
}

export function InventoryPanel({ householdId }: InventoryPanelProps) {
  const [items, setItems] = useState<InventoryItem[]>([])

  useEffect(() => {
    loadInventory(householdId).then(setItems)
  }, [householdId])

  if (items.length === 0) return <p className="panel__empty">No inventory tracked</p>

  return (
    <ul className="panel__list">
      {items.map(item => (
        <li key={item.id}>
          <span className="item__name">{item.name}</span>
          {item.quantity != null && (
            <span className="item__qty">
              {item.quantity}{item.unit ? ` ${item.unit}` : ''}
            </span>
          )}
          {item.category && (
            <span className="item__category">{item.category}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

async function loadInventory(householdId: number): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory')
    .select('id, name, quantity, unit, category')
    .eq('household_id', householdId)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (error) return []
  return data ?? []
}
