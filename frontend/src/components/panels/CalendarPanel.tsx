import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface CalendarEvent {
  id: number
  title: string
  date: string
  end_date: string | null
  all_day: boolean
  category: string | null
}

interface CalendarPanelProps {
  householdId: number
}

export function CalendarPanel({ householdId }: CalendarPanelProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    loadUpcomingEvents(householdId).then(setEvents)
  }, [householdId])

  if (events.length === 0) return <p className="panel__empty">No upcoming events</p>

  return (
    <ul className="panel__list">
      {events.map(event => (
        <li key={event.id}>
          <span className="item__date">{formatEventDate(event.date, event.all_day)}</span>
          <span className="item__name">{event.title}</span>
          {event.category && (
            <span className="item__category">{event.category}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

async function loadUpcomingEvents(householdId: number): Promise<CalendarEvent[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('events')
    .select('id, title, date, end_date, all_day, category')
    .eq('household_id', householdId)
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(20)
  if (error) return []
  return data ?? []
}

function formatEventDate(iso: string, isAllDay: boolean): string {
  const date = new Date(iso)
  if (isAllDay) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
