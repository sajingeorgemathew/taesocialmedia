import { PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface NavItem<Id extends string> {
  id: Id
  label: string
  icon: LucideIcon
  section: string
  /** Small count shown next to the label (hidden when 0). */
  count?: number
  countTone?: 'danger' | 'neutral'
}

interface AppSidebarProps<Id extends string> {
  items: NavItem<Id>[]
  activeId: Id
  onSelect: (id: Id) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  /** Phones and tablets: the sidebar is a drawer. */
  drawerOpen: boolean
  onCloseDrawer: () => void
  footer: ReactNode
}

/** Brand, grouped navigation and the account menu. */
export function AppSidebar<Id extends string>({
  items,
  activeId,
  onSelect,
  collapsed,
  onToggleCollapsed,
  drawerOpen,
  onCloseDrawer,
  footer,
}: AppSidebarProps<Id>) {
  const sections = [...new Set(items.map((i) => i.section))]

  return (
    <>
      <aside className={`sidebar${drawerOpen ? ' is-open' : ''}`} aria-label="Main">
        <div className="sidebar-brand">
          <img src="/logo_final_T.png" alt="" className="sidebar-logo" width={32} height={32} />
          <div className="sidebar-brand-text">
            <span className="sidebar-product">TAE Social</span>
            <span className="sidebar-org">Toronto Academy of Education</span>
          </div>
          <button type="button" className="icon-button sidebar-drawer-close" onClick={onCloseDrawer} aria-label="Close menu">
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Pages">
          {sections.map((section) => (
            <div key={section} className="sidebar-section">
              <p className="sidebar-section-label">{section}</p>
              <ul>
                {items
                  .filter((i) => i.section === section)
                  .map((item) => {
                    const active = item.id === activeId
                    const Icon = item.icon
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`nav-item${active ? ' is-active' : ''}`}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => onSelect(item.id)}
                          data-tooltip={collapsed ? item.label : undefined}
                        >
                          <Icon className="nav-icon" aria-hidden="true" />
                          <span className="nav-label">{item.label}</span>
                          {item.count !== undefined && item.count > 0 && (
                            <span className={`nav-count${item.countTone === 'danger' ? ' is-danger' : ''}`}>{item.count}</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {footer}
          <button
            type="button"
            className="icon-button sidebar-collapse"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            data-tooltip={collapsed ? 'Expand sidebar' : undefined}
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>
      </aside>
      {drawerOpen && <div className="sidebar-scrim" onClick={onCloseDrawer} aria-hidden="true" />}
    </>
  )
}
