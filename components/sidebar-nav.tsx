'use client'

import { Home, UtensilsCrossed, Wallet, Dumbbell, BarChart3, ClipboardList, Brain } from 'lucide-react'

type Tab = 'hoy' | 'food' | 'finanzas' | 'gym' | 'focus' | 'stats' | 'admin'

interface SidebarNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'hoy', label: 'Hoy', icon: Home },
  { id: 'finanzas', label: 'Finanzas', icon: Wallet },
  { id: 'food', label: 'Food', icon: UtensilsCrossed },
  { id: 'gym', label: 'Gym', icon: Dumbbell },
  { id: 'focus', label: 'Focus', icon: Brain },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'admin', label: 'Admin', icon: ClipboardList },
]

export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  return (
    <aside className="hidden lg:flex flex-col fixed top-0 left-0 h-full w-56 bg-background border-r border-border z-40">
      <div className="px-5 py-6 border-b border-border">
        <span className="text-base font-bold text-primary tracking-tight">Summer Quest</span>
      </div>
      <nav className="flex flex-col gap-1 p-3 flex-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left w-full ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
