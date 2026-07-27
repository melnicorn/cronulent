import fs from 'node:fs/promises'
import path from 'node:path'

let counter = 0

/**
 * Write a file atomically so a crash or power loss can never leave a truncated,
 * half-written destination behind (the failure mode that corrupts our JSON5
 * data files on abrupt shutdown).
 *
 * Writes to a temp file in the *same* directory (so the final rename stays on
 * one filesystem and is therefore atomic), flushes it to disk, then renames it
 * over the destination. A reader always sees either the previous complete file
 * or the new complete file — never a partial one. The temp file is cleaned up
 * if anything fails before the rename.
 */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp.${process.pid}.${counter++}`)

  try {
    const fh = await fs.open(tmp, 'w')
    try {
      await fh.writeFile(data, 'utf8')
      // Flush data + metadata to disk before the rename so the bytes are durable
      // if power is lost immediately after.
      await fh.sync()
    } finally {
      await fh.close()
    }
    await fs.rename(tmp, filePath)
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw err
  }
}
