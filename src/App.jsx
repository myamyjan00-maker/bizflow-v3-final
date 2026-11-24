import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Cases from './pages/Cases'
import CaseDetail from './pages/CaseDetail'
import Finance from './pages/Finance'
import Reports from './pages/Reports'
import BankTracker from './pages/BankTracker'
import Expenses from './pages/Expenses'
import Commissions from './pages/Commissions'
import Settings from './pages/Settings'
import { Toasts, useToast } from './components/UI'
import { LogoFull } from './components/Logo'
import Icon from './components/Icons'

const NAV = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'cases',     icon: 'folder',    label: '案件管理' },
  { id: 'banks',     icon: 'bank',      label: '银行追踪' },
  { id: 'reports',   icon: 'report',    label: '报表' },
  { id: 'expenses',  icon: 'receipt',   label: '费用 & Claim', adminOnly: true },
  { id: 'commissions', icon: 'users',   label: '佣金',        adminOnly: true },
  { id: 'finance',   icon: 'wallet',    label: '财务',        adminOnly: true },
  { id: 'settings',  icon: 'settings',  label: '设置',        adminOnly: true },
]

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('ssm_v3_user')) } catch { return null }
  })
  const [page, setPage] = useState('dashboard')
  const [caseId, setCaseId] = useState(null)
  const [caseFilter, setCaseFilter] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
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

  const submitSearch = (e) => {
    e.preventDefault()
    goTo('cases', null, { search: globalSearch.trim() })
  }
  const today = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        {/* Sidebar overlay (mobile) */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`fixed top-0 left-0 h-full w-64 bg-[#0f2a4a] text-slate-300 z-30 flex flex-col transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
          <div className="px-5 py-5">
            <LogoFull onNavy />
            <p className="text-[10px] tracking-wide text-slate-400 mt-1 pl-12">Business Suite</p>
          </div>

          <p className="px-6 pt-3 pb-1 text-[10px] font-bold tracking-widest text-slate-500">MAIN MENU</p>
          <nav className="flex-1 px-3 pb-4 space-y-0.5 overflow-y-auto">
            {nav.filter(n => n.id !== 'settings').map(n => {
              const active = page === n.id || (page === 'case' && n.id === 'cases')
              return (
                <button key={n.id} onClick={() => goTo(n.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}>
                  <Icon name={n.icon} size={18} />
                  {n.label}
                </button>
              )
            })}
            {nav.some(n => n.id === 'settings') && (
              <>
                <p className="px-3 pt-5 pb-1 text-[10px] font-bold tracking-widest text-slate-500">SYSTEM</p>
                <button onClick={() => goTo('settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    page === 'settings' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}>
                  <Icon name="settings" size={18} />设置
                </button>
              </>
            )}
          </nav>

          <div className="px-3 py-4 border-t border-white/10 space-y-1">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-9 h-9 rounded-full bg-teal-600 text-white flex items-center justify-center text-sm font-bold">
                {(currentUser.display_name || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{currentUser.display_name}</p>
                <p className="text-[11px] text-slate-400">{currentUser.role.replace('_', ' ')}</p>
              </div>
            </div>
            <button onClick={() => setDark(d => !d)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-slate-300 hover:bg-white/10 transition-colors">
              <Icon name={dark ? 'sun' : 'moon'} size={16} /> {dark ? '浅色模式' : '深色模式'}
            </button>
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-red-300 hover:bg-red-500/10 transition-colors">
              <Icon name="logout" size={16} /> 登出
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="md:pl-64 flex flex-col min-h-screen">
          <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 h-16 flex items-center gap-3">
            <button onClick={() => setSidebarOpen(s => !s)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
              <Icon name="menu" size={20} />
            </button>
            {page === 'case' && (
              <button onClick={() => setPage('cases')} className="text-sm text-slate-500 hover:text-teal-600 transition-colors whitespace-nowrap">← 案件列表</button>
            )}
            <form onSubmit={submitSearch} className="flex-1 max-w-xl relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" size={16} /></span>
              <input value={globalSearch} onChange={e => setGlobalSearch(e.target.value)}
                placeholder="搜索 案件编号、公司、Owner、IC…（按 Enter）"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-slate-100 dark:bg-slate-800 border border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 focus:outline-none" />
            </form>
            <div className="ml-auto hidden sm:block text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2">{today}</div>
          </header>

          <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
            {page === 'dashboard' && <Dashboard currentUser={currentUser} onNavigate={goTo} />}
            {page === 'cases' && <Cases currentUser={currentUser} onNavigate={goTo} initialFilter={caseFilter} toast={toast} />}
            {page === 'case' && caseId && <CaseDetail caseId={caseId} currentUser={currentUser} onBack={() => setPage('cases')} toast={toast} />}
            {page === 'banks' && <BankTracker currentUser={currentUser} onNavigate={goTo} />}
            {page === 'reports' && <Reports currentUser={currentUser} onNavigate={goTo} />}
            {page === 'expenses' && isAdmin && <Expenses currentUser={currentUser} toast={toast} />}
            {page === 'commissions' && isAdmin && <Commissions currentUser={currentUser} toast={toast} />}
            {page === 'finance' && isAdmin && <Finance currentUser={currentUser} onNavigate={goTo} toast={toast} />}
            {page === 'settings' && isAdmin && <Settings currentUser={currentUser} toast={toast} />}
          </main>
        </div>

        <Toasts toasts={toasts} />
      </div>
    </div>
  )
}
