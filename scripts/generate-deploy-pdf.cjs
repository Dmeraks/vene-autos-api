/**
 * Uso: npx -p pdfkit node scripts/generate-deploy-pdf.cjs
 */
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')

const root = path.join(__dirname, '..')
const mdPath = path.join(root, 'DEPLOY-CHECKLIST.md')
const outPath = path.join(root, 'DEPLOY-CHECKLIST.pdf')

const raw = fs.readFileSync(mdPath, 'utf8')
const lines = raw.split(/\r?\n/)

const doc = new PDFDocument({ size: 'A4', margin: 48 })
const stream = fs.createWriteStream(outPath)
doc.pipe(stream)

let inCode = false
for (const line of lines) {
  if (line.trim().startsWith('```')) {
    inCode = !inCode
    if (inCode) doc.moveDown(0.3)
    continue
  }
  if (line.startsWith('# ')) {
    doc.moveDown(0.4)
    doc.font('Helvetica-Bold').fontSize(16).text(line.slice(2), { continued: false })
  } else if (line.startsWith('## ')) {
    doc.moveDown(0.5)
    doc.font('Helvetica-Bold').fontSize(12).text(line.slice(3), { continued: false })
  } else if (inCode) {
    doc.font('Courier').fontSize(8.5).text(line || ' ', { continued: false })
  } else if (line.trim() === '---') {
    doc.moveDown(0.3)
  } else {
    doc.font('Helvetica').fontSize(10).text(line || ' ', { continued: false })
  }
}

doc.end()
stream.on('finish', () => {
  console.log('OK:', outPath)
})
