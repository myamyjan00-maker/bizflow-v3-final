import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { LogoIcon } from '../components/Logo'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async () => {
    setError(''); setLoading(true)
    try {
      // 1. 用 Supabase Auth 登入（username -> username@bizflow.local）
      const email = `${username.trim().toLowerCase()}@bizflow.local`
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email, password,
      })
      if (authError || !authData?.user) {
        setError('用户名或密码错误'); setLoading(false); return
      }

      // 2. 登入成功后，用 auth_id 反查 users 表拿到角色 / 显示名称
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authData.user.id)
        .single()

      if (profileError || !profile) {
        setError('找不到对应账号资料，请联系管理员')
        await supabase.auth.signOut()
        setLoading(false); return
      }
      if (profile.status !== 'active') {
        setError('账号已停用，请联系管理员')
        await supabase.auth.signOut()
        setLoading(false); return
      }

      sessionStorage.setItem('ssm_v3_user', JSON.stringify(profile))
      onLogin(profile)
    } catch {
      setError('连接失败，请检查网络')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <LogoIcon size={72} />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-3xl font-black text-white tracking-tight">
              Biz<span className="text-blue-400">Flow</span>
            </span>
            <span className="text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded">MY</span>
          </div>
          <p className="text-sm text-slate-400 tracking-widest uppercase">Start Smart. Grow Strong.</p>
        </div>

        {/* Login card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6">
          <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-5">登入账号</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-600">⚠️ {error}</div>
          )}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">用户名</label>
              <input value={username} onChange={e => setUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="输入用户名"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">密码</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="输入密码"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={() => setShowPass(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPass ? '🙈' : '👁'}</button>
              </div>
            </div>
            <button onClick={handleLogin} disabled={loading}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm disabled:opacity-50 transition-colors">
              {loading ? '登入中...' : '登入'}
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-4">请联系管理员获取账号</p>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          © 2026 BizFlow MY · Business Registration · Banking · Management
        </p>
      </div>
    </div>
  )
}
