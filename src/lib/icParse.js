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
  const hasF = /PEREMPUAN/i.test(L.map(l => l.text).join(' ')), hasM = /LELAKI/i.test(L.map(l => l.text).join(' '))
  let partial = '', partialIdx = -1
  if (icIdx < 0) {
    // 照片歪斜时 IC 号码会被拆成几段：把相邻的「纯数字碎片行」接起来再找
    const frag = t => /^[\dOoIl|\s.-]{2,}$/.test(t)
    outer: for (let i = 0; i < L.length; i++) {
      if (!frag(L[i].text)) continue
      let joined = L[i].text, conf = L[i].conf
      for (let k = 1; k <= 3 && i + k < L.length; k++) {
        if (!frag(L[i + k].text)) break
        joined += L[i + k].text; conf = Math.min(conf, L[i + k].conf)
        const m = joined.replace(/\s+/g, '').match(re)
        if (m && /\d/.test(m[0])) { icIdx = i; icRaw = fixDigits(m[1] + m[2] + m[3]); icConf = conf; break outer }
      }
      // 漏读了几位：至少保留已读到的数字，让用户补全
      const dg = fixDigits(joined.replace(/[\s.-]/g, '')).replace(/\D/g, '')
      if (dg.length >= 9 && dg.length <= 11 && partial.length < dg.length) { partial = dg; partialIdx = i }
    }
  }
  if (icIdx < 0 && partialIdx >= 0) { icIdx = partialIdx; icRaw = partial }
  const out = { sexText: hasF ? '女' : hasM ? '男' : '', ic: icRaw, name: '', address: '', dob: '', gender: '', warnings: [], low: {} }
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
    const letters = t.replace(/[^A-Za-z]/g, '').length
    if (!inAddr && !ADDR_START.test(t)) {
      // 姓名行：只有字母/空格/常见符号，且够长；太短的乱码行直接跳过
      if (letters >= 5 && /^[A-Za-z .'/@()-]+$/.test(t) && name.length < 3) { name.push(t.toUpperCase()); minConf = Math.min(minConf, l.conf); continue }
      if (!name.length) continue
    }
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

// 把多次识别的结果合并：IC 逐位投票、姓名/地址取出现最多的
export function mergeResults(rs) {
  const out = { ...rs[0], warnings: [], low: {} }
  const ics = rs.map(r => r.ic).filter(x => x && x.length === 12)
  const partials = rs.map(r => r.ic).filter(x => x && x.length < 12).sort((a, b) => b.length - a.length)
  if (!ics.length && partials.length) { out.ic = partials[0]; out.low.ic = true; out.partialIc = true }
  else if (ics.length) {
    let ic = ''
    for (let i = 0; i < 12; i++) {
      const c = {}
      ics.forEach(x => { c[x[i]] = (c[x[i]] || 0) + 1 })
      ic += Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]
    }
    // 投票结果日期不合理时，改用日期合理的候选
    if (!validIC(ic).ok) ic = ics.find(x => validIC(x).ok) || ic
    out.ic = ic
    const agree = ics.filter(x => x === ic).length
    if (agree < 2) out.low.ic = true
  } else out.ic = ''
  const v = validIC(out.ic)
  out.dob = v.ok ? v.dob : ''; out.gender = v.ok ? v.gender : ''
  const pick = (key) => {
    const vals = rs.map(r => r[key]).filter(Boolean)
    if (!vals.length) return ''
    const c = {}; vals.forEach(x => { c[x] = (c[x] || 0) + 1 })
    const top = Object.entries(c).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    if (top[0][1] < 2) out.low[key] = true
    return top[0][0]
  }
  out.name = pick('name'); out.address = pick('address')
  const sexText = rs.map(r => r.sexText).find(Boolean)
  if (!out.ic) out.warnings.push('没有读到 IC 号码，请手动填写')
  else if (out.partialIc) out.warnings.push(`IC 只读到 ${out.ic.length} 位数字（应为 12 位），请对照照片补全`)
  else if (!v.ok) out.warnings.push(v.msg)
  if (v.ok && sexText && sexText !== v.gender) out.warnings.push('IC 最后一位的性别与卡上文字不一致，IC 号码很可能读错了')
  if (!out.name) out.warnings.push('没有读到姓名，请手动填写')
  if (!out.address) out.warnings.push('没有读到地址，请手动填写')
  return out
}
