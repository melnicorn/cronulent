/**
 * Copy text to the clipboard, returning whether it worked.
 *
 * `navigator.clipboard` only exists in a secure context — HTTPS, localhost, or
 * file://. Cronulent is typically served over plain HTTP on a LAN address,
 * where the API is simply undefined and calling it throws. So fall back to the
 * legacy selection-based copy, which has no such restriction.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or the document isn't focused — try the fallback.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  // Kept off-screen rather than hidden: a display:none element can't be selected.
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)

  try {
    textarea.select()
    // iOS Safari ignores select() on its own.
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
