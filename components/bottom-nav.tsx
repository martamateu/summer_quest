'use client'

import { Home, UtensilsCrossed, Wallet, Dumbbell, BarChart3, ClipboardList, Brain } from 'lucide-react'

type Tab = 'hoy' | 'food' | 'finanzas' | 'gym' | 'focus' | 'stats' | 'admin'

interface BottomNavProps {
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

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border safe-area-pb">
      <div className="flex items-center justify-around max-w-md mx-auto py-2">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-xl transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
