import { useState } from 'react'
import { parseMyKad } from '../lib/icParse'

const TESS_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = TESS_SRC; s.onload = () => resolve(window.Tesseract); s.onerror = () => reject(new Error('无法载入识别程序，请检查网络'))
    document.head.appendChild(s)
  })
}

const STATUS = {
  idle: ['待识别', 'bg-slate-100 text-slate-500'],
  processing: ['识别中…', 'bg-blue-50 text-blue-600'],
  review: ['需要检查', 'bg-amber-50 text-amber-700'],
  done: ['已识别', 'bg-emerald-50 text-emerald-700'],
  failed: ['识别失败', 'bg-red-50 text-red-600'],
}

// 上传 IC → 在浏览器本地识别（图片不会传给任何第三方）→ 把结果交给表单让用户检查修改
export default function IcScanner({ file, onFile, onExtract }) {
  const [status, setStatus] = useState('idle')
  const [msgs, setMsgs] = useState([])
  const [preview, setPreview] = useState(null)

  const pick = async (e) => {
    const f = e.target.files[0] || null
    onFile(f); setMsgs([]); setStatus('idle')
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
    if (!f) return
    if (!f.type.startsWith('image/')) { setMsgs(['PDF 不能自动识别，文件会保存，请手动填写资料']); return }
    setStatus('processing')
    try {
      const T = await loadTesseract()
      const worker = await T.createWorker('eng')
      const { data } = await worker.recognize(f)
      await worker.terminate()
      const lines = (data.lines || []).map(l => ({ text: l.text, conf: l.confidence }))
      const r = parseMyKad(lines.length ? lines : String(data.text || '').split('\n').map(t => ({ text: t, conf: 70 })))
      const warn = [...r.warnings]
      if (r.low.ic) warn.push('IC 号码识别可信度低，请对照照片')
      if (r.low.name) warn.push('姓名识别可信度低，请对照照片')
      if (r.low.address) warn.push('地址识别可信度低，请对照照片')
      setMsgs(warn); setStatus(warn.length ? 'review' : 'done')
      onExtract(r)
    } catch (err) { setStatus('failed'); setMsgs([err.message || '识别失败，请手动填写']) }
  }

  const [label, cls] = STATUS[status]
  return (
    <div className="pt-2 border-t border-slate-100 space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-600">上传 Owner IC（正面）· 自动读取资料</label>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
      </div>
      <input type="file" accept="image/*,.pdf" onChange={pick}
        className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-teal-50 file:text-teal-700 file:text-xs" />
      {preview && <img src={preview} alt="IC" className="max-h-40 rounded-lg border border-slate-200" />}
      {msgs.map((m, i) => <p key={i} className="text-[11px] text-amber-600">⚠️ {m}</p>)}
      <p className="text-[11px] text-slate-400">🔒 识别在你的浏览器里完成，图片不会发给第三方；识别结果可能有错，请对照照片检查后再保存。</p>
    </div>
  )
}
