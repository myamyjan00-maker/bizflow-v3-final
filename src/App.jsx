import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Cases from './pages/Cases'
import CaseDetail from './pages/CaseDetail'
import Finance from './pages/Finance'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import { Toasts, useToast } from './components/UI'
import { LogoFull, LogoIcon } from './components/Logo'

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'cases',     icon: '📁', label: '案件管理' },
  { id: 'reports',   icon: '📋', label: '报表' },
  { id: 'finance',   icon: '💰', label: '财务',      adminOnly: true },
  { id: 'settings',  icon: '⚙️',  label: '设置',      adminOnly: true },
]

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('ssm_v3_user')) } catch { return null }
  })
  const [page, setPage] = useState('dashboard')
  const [caseId, setCaseId] = useState(null)
  const [caseFilter, setCaseFilter] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dark, setDark] = useState(() => localStorage.getItem('ssm_v3_dark') === 'true')
  const { toasts, toast } = useToast()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('ssm_v3_dark', dark)
  }, [dark])

  const handleLogin = (user) => setCurrentUser(user)

  const handleLogout = () => {
    sessionStorage.removeItem('ssm_v3_user')
    setCurrentUser(null)
  }

  const goTo = (target, id, filter) => {
    if (target === 'case') { setCaseId(id); setPage('case') }
    else if (target === 'cases') { setCaseFilter(filter || null); setPage('cases') }
    else { setPage(target) }
    setSidebarOpen(false)
  }

  if (!currentUser) return <Login onLogin={handleLogin} />

  const isAdmin = ['super_admin', 'admin'].includes(currentUser.role)
  const nav = NAV.filter(n => !n.adminOnly || isAdmin)

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-teal-50/40 dark:bg-teal-950/30 text-slate-900 dark:text-slate-100">
        {/* Sidebar overlay (mobile) */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30 flex flex-col transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
          {/* Logo */}
          <div className="px-5 py-5 border-b border-slate-100 dark:border-slate-800">
            <LogoFull dark={dark} />
            <p className="text-[10px] text-slate-400 mt-1 pl-12">{currentUser.display_name}</p>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {nav.map(n => (
              <button key={n.id} onClick={() => goTo(n.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  (page === n.id || (page === 'case' && n.id === 'cases'))
                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/30'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}>
                <span className="text-base">{n.icon}</span>
                {n.label}
              </button>
            ))}
          </nav>

          {/* Bottom */}
          <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800 space-y-1">
            <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{currentUser.display_name}</p>
              <p className="text-[10px] text-slate-400">{currentUser.role.replace('_', ' ')}</p>
            </div>
            <button onClick={() => setDark(d => !d)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {dark ? '☀️' : '🌙'} {dark ? '浅色模式' : '深色模式'}
            </button>
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">
              🚪 登出
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="md:pl-64 flex flex-col min-h-screen">
          {/* Top bar */}
          <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(s => !s)} className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">☰</button>
              {page === 'case' && (
                <button onClick={() => setPage('cases')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-teal-600 transition-colors">
                  ← 案件列表
                </button>
              )}
              {page !== 'case' && (
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {nav.find(n => n.id === page)?.label || ''}
                </h2>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toast('已刷新', 'success')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 text-sm">🔄</button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
            {page === 'dashboard' && <Dashboard currentUser={currentUser} onNavigate={goTo} />}
            {page === 'cases' && <Cases currentUser={currentUser} onNavigate={goTo} initialFilter={caseFilter} toast={toast} />}
            {page === 'case' && caseId && <CaseDetail caseId={caseId} currentUser={currentUser} onBack={() => setPage('cases')} toast={toast} />}
            {page === 'reports' && <Reports currentUser={currentUser} onNavigate={goTo} />}
            {page === 'finance' && isAdmin && <Finance currentUser={currentUser} onNavigate={goTo} toast={toast} />}
            {page === 'settings' && isAdmin && <Settings currentUser={currentUser} toast={toast} />}
          </main>
        </div>

        <Toasts toasts={toasts} />
      </div>
    </div>
  )
}
