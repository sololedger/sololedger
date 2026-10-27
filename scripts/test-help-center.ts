import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { helpArticles, helpTopics, helpDestinations, findHelpArticle, searchHelp, normalizeHelpText } from '../src/lib/helpContent.ts'
import { helpQuestionUrl, helpNavigationUrl, helpPasswordResetUrl, isHelpDestination } from '../src/lib/helpNavigation.ts'

const ids = helpArticles.flatMap(a => [a.id, ...(a.aliases ?? [])])
assert.equal(new Set(ids).size, ids.length, 'IDs and aliases must be unique')
for (const article of helpArticles) {
  assert.match(article.id, /^[a-z0-9-]+$/)
  assert.ok(helpTopics.some(topic => topic.id === article.topic))
  assert.ok(article.title && article.answer && article.keywords.length)
  assert.match(article.reviewed, /^\d{4}-\d{2}-\d{2}$/)
  for (const destination of article.destinations ?? []) assert.ok(Object.hasOwn(helpDestinations, destination))
  for (const source of article.sources ?? []) {
    const url = new URL(source.href)
    assert.equal(url.protocol, 'https:')
    assert.ok(['www.skatteverket.se', 'www.bfn.se'].includes(url.host))
  }
  if (article.media) {
    assert.match(article.media.src, /^\/help\/[a-zA-Z0-9/_.-]+$/)
    assert.ok(existsSync('public' + article.media.src))
    assert.ok(article.media.caption)
    if (article.media.kind === 'image') assert.ok(article.media.alt && article.media.width > 0 && article.media.height > 0)
    else {
      assert.ok(article.media.transcript)
      assert.match(article.media.captions, /^\/help\/[a-zA-Z0-9/_.-]+\.vtt$/)
      assert.ok(existsSync('public' + article.media.captions))
    }
  }
}
const includes = (query: string, id: string) => assert.ok(searchHelp(query).some(article => article.id === id), query)
assert.equal(searchHelp('   ').length, helpArticles.length)
assert.equal(searchHelp('xyzzzzsyntetisk').length, 0)
assert.equal(normalizeHelpText('Å Ä Ö'), 'a a o')
for (const query of ['R14', 'r14', 'R11 R14', 'VÍNST R14']) includes(query, 'ne-r14')
for (const query of ['rätta', 'ratta', 'korrigera']) includes(query, 'ratta-bokning')
for (const query of ['utlägg', 'utlagg', 'privat betalning']) includes(query, 'privat-betalning')
for (const query of ['uttagsutrymme', 'säkert uttag', 'sakert uttag']) includes(query, 'sakert-uttag')
assert.ok(searchHelp('momsfri', 'start').some(a => a.id === 'momsprofil-eu'))
assert.ok(searchHelp('moms', 'vat').every(a => a.topic === 'vat'))
assert.equal(searchHelp('R14', 'invoice').length, 0)
assert.equal(findHelpArticle('r14')?.id, 'ne-r14')
assert.equal(findHelpArticle('unknown'), undefined)
assert.equal(findHelpArticle(null), undefined)
assert.match(findHelpArticle('ne-r14')!.answer, /R11 visar årets bokförda resultat/)
assert.match(findHelpArticle('ne-r14')!.answer, /R14 gäller bokförda intäkter som inte ska tas upp till beskattning/)
assert.match(findHelpArticle('skattekonto')!.answer, /två olika händelser/)
assert.match(findHelpArticle('deklarationshistorik')!.answer, /kräver låst år och godkända kontroller/)
const authUrl = 'https://example.test/?code=synthetic-code&help=r14&email=synthetic@example.test#access_token=synthetic&type=recovery'
assert.equal(helpQuestionUrl(authUrl, 'r14'), 'https://example.test/?help=ne-r14')
assert.equal(helpPasswordResetUrl(authUrl), 'https://example.test/?help=ne-r14')
assert.equal(helpPasswordResetUrl('https://example.test/?help=unknown#access_token=synthetic'), 'https://example.test')
assert.throws(() => helpQuestionUrl(authUrl, 'unknown'))
const next = new URL(helpNavigationUrl(authUrl, 'skattekonto'), 'https://example.test')
assert.equal(next.searchParams.get('code'), 'synthetic-code')
assert.equal(next.hash, new URL(authUrl).hash)
assert.equal(next.searchParams.get('help'), 'skattekonto')
assert.equal(new URL(helpNavigationUrl(authUrl, null), 'https://example.test').searchParams.has('help'), false)
assert.equal(isHelpDestination('moms'), true)
for (const value of ['admin', 'constructor', '__proto__', 'https://example.test', null]) assert.equal(isHelpDestination(value), false)
console.log('PASS KAN-102 content, search, topic, aliases, link privacy and auth URL preservation')
