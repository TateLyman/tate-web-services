import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const address = process.argv[2]
const inputPath = process.argv[3] ?? 'outreach/message-data.json'
const outputDir = process.argv[4] ?? 'outreach/generated/messages'

if (!address || address.trim().length < 8 || /\[|\]/.test(address)) {
  console.error('Usage: node scripts/render-outreach-messages.mjs "VALID PHYSICAL MAILING ADDRESS"')
  process.exit(1)
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const messages = JSON.parse(await readFile(inputPath, 'utf8'))
await mkdir(outputDir, { recursive: true })

for (const message of messages) {
  const body = `${message.body.trim()}\n\n${address.trim()}\nReply "no" and I will not follow up.\n`
  const output = [
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    ``,
    body,
  ].join('\n')
  const filename = `${slugify(message.business)}.txt`
  await writeFile(join(outputDir, filename), output)
  console.log(`Wrote ${join(outputDir, filename)}`)
}
