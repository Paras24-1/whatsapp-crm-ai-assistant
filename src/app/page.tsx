'use client'

import DashboardLayout from '@/components/layout/DashboardLayout'
import StatCards from '@/components/dashboard/StatCards'
import LeadsWidget from '@/components/dashboard/LeadsWidget'
import SchedulesWidget from '@/components/dashboard/SchedulesWidget'
import TasksWidget from '@/components/dashboard/TasksWidget'
import TodosWidget from '@/components/dashboard/TodosWidget'
import StickyNotesWidget from '@/components/dashboard/StickyNotesWidget'
import { useAuth } from '@/contexts/AuthContext'

export default function DashboardPage() {
  const { profile } = useAuth()

  const displayName = profile?.company_name || profile?.name || 'VoxAI Workspace'

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Dashboard Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-gray-100 dark:border-gray-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                {displayName}
              </h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {profile?.role === 'admin' ? 'Admin Dashboard' : 'Team Operations'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Live overview of leads, team schedules, automated WhatsApp follow-ups, and billing
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync Active
            </span>
          </div>
        </div>

        <StatCards />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <LeadsWidget />
            <TasksWidget />
          </div>
          
          <div className="space-y-6">
            <SchedulesWidget />
            <TodosWidget />
          </div>
        </div>

        <div className="w-full">
          <StickyNotesWidget />
        </div>
      </div>
    </DashboardLayout>
  )
}
