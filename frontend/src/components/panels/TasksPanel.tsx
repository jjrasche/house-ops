import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface Task {
  id: number
  title: string
  category: string | null
  assigned_to: string | null
  due_date: string | null
  status: string
}

interface TasksPanelProps {
  householdId: number
}

export function TasksPanel({ householdId }: TasksPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    loadOpenTasks(householdId).then(setTasks)
  }, [householdId])

  if (tasks.length === 0) return <p className="panel__empty">No open tasks</p>

  return (
    <ul className="panel__list">
      {tasks.map(task => (
        <li key={task.id}>
          <span className="item__name">{task.title}</span>
          {task.due_date && (
            <span className="item__due">{formatDate(task.due_date)}</span>
          )}
          {task.assigned_to && (
            <span className="item__assigned">{task.assigned_to}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

async function loadOpenTasks(householdId: number): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, category, assigned_to, due_date, status')
    .eq('household_id', householdId)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) return []
  return data ?? []
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
