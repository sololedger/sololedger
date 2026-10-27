import { findHelpArticle, helpDestinations, type HelpDestination, type HelpTopic } from './helpContent'

export type HelpReadingState = { query: string; topic: HelpTopic | 'all'; open: string[]; anchor: string | null }
export const emptyHelpReading = (): HelpReadingState => ({ query: '', topic: 'all', open: [], anchor: null })

// Build shared links from scratch. Auth/query/hash data never enters a copied link.
export function helpQuestionUrl(appUrl: string, id: string): string {
  const article = findHelpArticle(id)
  if (!article) throw new Error('Frågan kunde inte hittas.')
  const app = new URL(appUrl)
  return `${app.origin}${app.pathname}?help=${encodeURIComponent(article.id)}`
}
export function isHelpDestination(value: unknown): value is HelpDestination {
  return typeof value === 'string' && Object.hasOwn(helpDestinations, value)
}
export function helpPasswordResetUrl(appUrl: string): string {
  const url = new URL(appUrl)
  const article = findHelpArticle(url.searchParams.get('help'))
  return article ? `${url.origin}/?help=${encodeURIComponent(article.id)}` : url.origin
}
// Change only our parameter. Supabase owns the auth hash/code and consumes it itself.
export function helpNavigationUrl(appUrl: string, id: string | null): string {
  const url = new URL(appUrl)
  if (id === null) url.searchParams.delete('help')
  else url.searchParams.set('help', id)
  return `${url.pathname}${url.search}${url.hash}`
}
