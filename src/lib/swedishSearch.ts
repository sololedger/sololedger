export function normalizeSwedishText(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('sv-SE').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function normalizeHelpText(text: string): string {
  return normalizeSwedishText(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function containsSearchPhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `)
}
