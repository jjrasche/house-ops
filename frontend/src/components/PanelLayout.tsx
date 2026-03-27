import { ShoppingPanel } from './panels/ShoppingPanel'
import { TasksPanel } from './panels/TasksPanel'
import { CalendarPanel } from './panels/CalendarPanel'
import { InventoryPanel } from './panels/InventoryPanel'

interface PanelLayoutProps {
  householdId: number
  refreshKey?: number
}

const PANELS = [
  { id: 'shopping', label: 'Shopping', Component: ShoppingPanel },
  { id: 'tasks', label: 'Tasks', Component: TasksPanel },
  { id: 'calendar', label: 'Calendar', Component: CalendarPanel },
  { id: 'inventory', label: 'Inventory', Component: InventoryPanel },
] as const

export function PanelLayout({ householdId, refreshKey }: PanelLayoutProps) {
  return (
    <div className="panel-layout">
      <div className="panel-strip">
        {PANELS.map(({ id, label, Component }) => (
          <section key={id} className="panel" id={`panel-${id}`}>
            <h2 className="panel__title">{label}</h2>
            <Component householdId={householdId} refreshKey={refreshKey} />
          </section>
        ))}
      </div>
    </div>
  )
}
