import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { CommandPalette } from '@/components/layout/CommandPalette'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen">
      <Sidebar />
      <Topbar />
      <CommandPalette />
      <main className="lg:ml-[240px] pt-14 min-h-screen">
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
  )
}
