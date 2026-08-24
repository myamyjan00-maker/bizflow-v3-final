// 生成单一银行户口的交接报告（公司资料 + Owner 资料 + 该银行完整资料），
// 在浏览器端直接生成 .docx 并触发下载，不需要后端服务器。
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, Header, Footer, ImageRun,
} from 'docx'

// BizFlow Logo，转成小尺寸 PNG 后转 base64 内嵌，避免额外读取檔案
const LOGO_BASE64 = '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'

// deposits 表本身没有欄位标示我们需要的完整值，我们直接接受调用方组好的一个 plain object
export async function generateBankReport({ companyName, caseNo, ssm, owner, bank }) {
  const TABLE_WIDTH = 9400
  const COL1 = 2400, COL2 = 7000
  const TEAL = '0F6E56'
  const GRAY = '6B7280'
  const INK = '1F2937'

  const row = (label, value) => {
    if (value === null || value === undefined || value === '') return null
    return new TableRow({
      cantSplit: true,
      children: [
        new TableCell({
          width: { size: COL1, type: WidthType.DXA },
          margins: { top: 55, bottom: 55, left: 0, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 16, color: GRAY })] })],
        }),
        new TableCell({
          width: { size: COL2, type: WidthType.DXA },
          margins: { top: 55, bottom: 55, left: 0, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: String(value), size: 17, color: INK })] })],
        }),
      ],
    })
  }

  const sectionTable = (rawRows) => {
    const rows = rawRows.filter(r => r !== null)
    if (rows.length === 0) return null
    return new Table({
      width: { size: TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [COL1, COL2],
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' }, insideVertical: { style: BorderStyle.NONE },
      },
      rows,
    })
  }

  const h2 = (text) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 20, color: INK })],
    spacing: { before: 140, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: TEAL, space: 4 } },
    keepNext: true,
  })
  const h4 = (text) => new Paragraph({ children: [new TextRun({ text, bold: true, size: 16, color: TEAL })], spacing: { before: 90, after: 40 }, keepNext: true })

  const section = (title, rows, isH4) => {
    const table = sectionTable(rows)
    if (!table) return []
    return [isH4 ? h4(title) : h2(title), table]
  }

  let securityQa = []
  try {
    securityQa = Array.isArray(bank.security_qa) ? bank.security_qa : JSON.parse(bank.security_qa || '[]')
  } catch { securityQa = [] }
  securityQa = securityQa.filter(qa => qa.q || qa.a)

  const logoBytes = Uint8Array.from(atob(LOGO_BASE64), c => c.charCodeAt(0))

  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 500, bottom: 500, left: 850, right: 850 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'BizFlow MY', size: 12, color: 'D1D5DB' })], alignment: AlignmentType.RIGHT })] }) },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({ type: 'png', data: logoBytes, transformation: { width: 16, height: 16 } }),
              new TextRun({ text: '  BizFlow MY', size: 13, color: 'A3A3A3', bold: true }),
            ],
          })],
        }),
      },
      children: [
        new Paragraph({ children: [new TextRun({ text: companyName || '（未命名公司）', bold: true, size: 26, color: INK })], spacing: { after: 30 } }),
        new Paragraph({
          children: [new TextRun({ text: `${caseNo}　·　${bank.bank_name} 交接资料　·　${new Date().toLocaleDateString('en-MY')}`, size: 15, color: GRAY })],
          spacing: { after: 60 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 } },
        }),
        new Paragraph({
          spacing: { before: 30, after: 0 },
          children: [new TextRun({ text: '⚠ 本文件含银行登入密码与 ATM 密码等敏感资讯，请妥善保管，交接完成后建议删除。', size: 14, italics: true, color: '92400E' })],
        }),

        ...section('公司资料 (SSM)', [
          row('公司名称', ssm?.ssm_name),
          row('注册号', ssm?.reg_no),
          row('注册日期', ssm?.reg_date),
          row('公司地址', ssm?.address),
        ]),

        ...section('Owner 资料', [
          row('姓名', owner?.name),
          row('IC No.', owner?.ic),
          row('母亲姓名', owner?.mother_name),
          row('电话', owner?.phone),
          row('Email', owner?.email),
          row('地址', owner?.address),
        ]),

        ...section(`${bank.bank_name} 银行资料`, [
          row('账号', bank.account_no), row('分行', bank.branch), row('开户日期', bank.open_date),
          row('交接日期', bank.handover_date), row('COM ID', bank.com_id), row('状态', bank.status),
        ]),
        ...section('网银登入资料', [
          row('网银 User ID', bank.ob_user_id), row('网银密码', bank.ob_password), row('Corp ID', bank.corp_id),
          row('Secure Plus Serial', bank.secure_plus_serial), row('Login ID', bank.login_id), row('Access ID', bank.access_id),
        ], true),
        ...section('ATM 卡资料', [row('ATM 卡号', bank.atm_card_no), row('ATM 密码', bank.atm_pin), row('TAC 手机号', bank.tac_phone)], true),
        ...(securityQa.length > 0 ? section('安全问题 (Security Questions)', securityQa.map((qa, i) => row(`问题 ${i + 1}`, `${qa.q}  →  答案：${qa.a}`))) : []),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(companyName || 'report').replace(/[^\w\u4e00-\u9fa5]+/g, '_')}_${bank.bank_name}_交接资料.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// PDF 版本：浏览器没办法直接把 Word 转成 PDF，用套件生成 PDF 又会遇到中文字型显示的问题，
// 所以改用「打印预览」的方式——开一个排版好的网页分页，叫出浏览器的打印视窗，选「另存为 PDF」即可，
// 这样中文显示最稳定可靠，不需要额外嵌入字型档。
export function printBankReportPDF({ companyName, caseNo, ssm, owner, bank }) {
  let securityQa = []
  try {
    securityQa = Array.isArray(bank.security_qa) ? bank.security_qa : JSON.parse(bank.security_qa || '[]')
  } catch { securityQa = [] }
  securityQa = securityQa.filter(qa => qa.q || qa.a)

  const esc = (s) => (s === null || s === undefined || s === '') ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const rowHtml = (label, value) => {
    if (value === null || value === undefined || value === '') return ''
    return `<tr><td class="label">${esc(label)}</td><td class="value">${esc(value)}</td></tr>`
  }
  const sectionHtml = (title, rowsHtml, isSub) => {
    const filled = rowsHtml.filter(Boolean).join('')
    if (!filled) return ''
    return `<h${isSub ? '4' : '2'}>${esc(title)}</h${isSub ? '4' : '2'}><table>${filled}</table>`
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(companyName)} - ${esc(bank.bank_name)} 交接资料</title>
<style>
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; color: #1F2937; margin: 0; padding: 0; }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .subtitle { font-size: 11px; color: #6B7280; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px; margin-bottom: 6px; }
  .warn { font-size: 10px; color: #92400E; font-style: italic; margin-bottom: 10px; }
  h2 { font-size: 14px; border-bottom: 2px solid #0F6E56; padding-bottom: 4px; margin: 16px 0 6px; }
  h4 { font-size: 11px; color: #0F6E56; margin: 10px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  td { padding: 5px 8px 5px 0; border-bottom: 1px solid #E5E7EB; font-size: 11px; vertical-align: top; }
  td.label { color: #6B7280; font-weight: bold; width: 28%; white-space: nowrap; }
  td.value { color: #1F2937; }
  .footer { text-align: center; font-size: 9px; color: #A3A3A3; margin-top: 24px; }
  .footer img { width: 12px; height: 12px; vertical-align: middle; margin-right: 4px; }
</style></head>
<body onload="window.print()">
  <h1>${esc(companyName) || '（未命名公司）'}</h1>
  <div class="subtitle">${esc(caseNo)}　·　${esc(bank.bank_name)} 交接资料　·　${new Date().toLocaleDateString('en-MY')}</div>
  <div class="warn">⚠ 本文件含银行登入密码与 ATM 密码等敏感资讯，请妥善保管，交接完成后建议删除。</div>

  ${sectionHtml('公司资料 (SSM)', [
    rowHtml('公司名称', ssm?.ssm_name), rowHtml('注册号', ssm?.reg_no), rowHtml('注册日期', ssm?.reg_date), rowHtml('公司地址', ssm?.address),
  ])}
  ${sectionHtml('Owner 资料', [
    rowHtml('姓名', owner?.name), rowHtml('IC No.', owner?.ic), rowHtml('母亲姓名', owner?.mother_name),
    rowHtml('电话', owner?.phone), rowHtml('Email', owner?.email), rowHtml('地址', owner?.address),
  ])}
  ${sectionHtml(`${bank.bank_name} 银行资料`, [
    rowHtml('账号', bank.account_no), rowHtml('分行', bank.branch), rowHtml('开户日期', bank.open_date),
    rowHtml('交接日期', bank.handover_date), rowHtml('COM ID', bank.com_id), rowHtml('状态', bank.status),
  ])}
  ${sectionHtml('网银登入资料', [
    rowHtml('网银 User ID', bank.ob_user_id), rowHtml('网银密码', bank.ob_password), rowHtml('Corp ID', bank.corp_id),
    rowHtml('Secure Plus Serial', bank.secure_plus_serial), rowHtml('Login ID', bank.login_id), rowHtml('Access ID', bank.access_id),
  ], true)}
  ${sectionHtml('ATM 卡资料', [rowHtml('ATM 卡号', bank.atm_card_no), rowHtml('ATM 密码', bank.atm_pin), rowHtml('TAC 手机号', bank.tac_phone)], true)}
  ${securityQa.length > 0 ? sectionHtml('安全问题 (Security Questions)', securityQa.map((qa, i) => rowHtml(`问题 ${i + 1}`, `${qa.q}  →  答案：${qa.a}`))) : ''}

  <div class="footer">
    <img src="data:image/png;base64,${LOGO_BASE64}" alt="logo" />BizFlow MY
  </div>
</body></html>`

  const win = window.open('', '_blank')
  if (!win) { alert('弹出视窗被浏览器挡住了，请允许弹出视窗后再试一次'); return }
  win.document.write(html)
  win.document.close()
}
