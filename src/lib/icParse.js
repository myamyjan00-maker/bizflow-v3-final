// 马来西亚 MyKad OCR 文字解析（只在浏览器本地运行，不联网）
const NOISE = /(MYKAD|MALAYSIA|KAD\s*PENGENALAN|WARGANEGARA|LELAKI|PEREMPUAN|ISLAM|BUKAN\s*ISLAM|^WARGA|IDENTITY|CARD|^MY$)/i
const ADDR_START = /^(\d|NO[\s.,]|LOT\b|JALAN|JLN|LORONG|LRG|TAMAN|TMN|KG\b|KAMPUNG|BATU|BLOK|BLK|UNIT|PT\b|PLOT|LEBUH|PERSIARAN|BANDAR|SEKSYEN|APT|RUMAH|FLAT|LEVEL)/i
const STATES = /^(JOHOR|KEDAH|KELANTAN|MELAKA|NEGERI\s*SEMBILAN|PAHANG|PERAK|PERLIS|PULAU\s*PINANG|SABAH|SARAWAK|SELANGOR|TERENGGANU|W\.?\s*P\.?\b.*|WILAYAH\s*PERSEKUTUAN.*)$/i

const fixDigits = s => s.replace(/[OoQD]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8')

export function validIC(ic) {
  const d = String(ic || '').replace(/\D/g, '')
  if (d.length !== 12) return { ok: false, msg: 'IC 必须是 12 位数字' }
  const yy = +d.slice(0, 2), mm = +d.slice(2, 4), dd = +d.slice(4, 6)
  const year = yy > 26 ? 1900 + yy : 2000 + yy
  const dt = new Date(year, mm - 1, dd)
  if (mm < 1 || mm > 12 || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return { ok: false, msg: '出生日期不合理（' + d.slice(0, 6) + '）' }
  return { ok: true, dob: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, gender: (+d[11]) % 2 === 1 ? '男' : '女' }
}

// lines: [{ text, conf }]
export function parseMyKad(lines) {
  const L = lines.map(l => ({ text: (l.text || '').replace(/\s+/g, ' ').trim(), conf: l.conf ?? 100 })).filter(l => l.text)
  let icIdx = -1, icRaw = '', icConf = 100
  const re = /([0-9OoQDIl|SB]{6})\s*[-–—_.]?\s*([0-9OoQDIl|SB]{2})\s*[-–—_.]?\s*([0-9OoQDIl|SB]{4})/
  for (let i = 0; i < L.length; i++) {
    const m = L[i].text.match(re)
    if (m && /\d/.test(m[0])) { icIdx = i; icRaw = fixDigits(m[1] + m[2] + m[3]); icConf = L[i].conf; break }
  }
  const out = { ic: icRaw, name: '', address: '', dob: '', gender: '', warnings: [], low: {} }
  if (icRaw) {
    const v = validIC(icRaw)
    if (v.ok) { out.dob = v.dob; out.gender = v.gender } else out.warnings.push(v.msg)
    if (icConf < 80) out.low.ic = true
  } else out.warnings.push('没有读到 IC 号码，请手动填写')
  const after = icIdx >= 0 ? L.slice(icIdx + 1) : L
  const name = [], addr = []
  let inAddr = false, minConf = 100, aConf = 100
  for (const l of after) {
    const t = l.text.replace(/[^A-Za-z0-9 .,'/@()-]/g, '').trim()
    if (!t || NOISE.test(t)) continue
    if (/^[\d\s-]+$/.test(t) && t.replace(/\D/g, '').length >= 6) continue
    if (!inAddr && !ADDR_START.test(t) && /^[A-Za-z .,'/@()-]+$/.test(t) && name.length < 3) { name.push(t.toUpperCase()); minConf = Math.min(minConf, l.conf); continue }
    inAddr = true
    addr.push(t.toUpperCase()); aConf = Math.min(aConf, l.conf)
    if (STATES.test(t)) break
  }
  out.name = name.join(' ')
  out.address = addr.join(', ')
  if (!out.name) out.warnings.push('没有读到姓名，请手动填写')
  if (!out.address) out.warnings.push('没有读到地址，请手动填写')
  if (minConf < 80) out.low.name = true
  if (aConf < 80) out.low.address = true
  return out
}
