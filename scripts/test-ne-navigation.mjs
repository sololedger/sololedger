// Actual NE components, synthetic in-memory transports; no server or database.
import { neUxHarness } from './ne-ux-harness.mjs'
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const output = 'test-results/kan115-navigation-' + Date.now()
await mkdir(output, { recursive: true })
const { js, css } = await neUxHarness()
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [1440, 390, 320]) for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion, hasTouch: width < 500 })
    const errors = [], requests = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', route => {
      if (route.request().url() === 'https://kan115.test/') return route.fulfill({ contentType: 'text/html', body: '<html lang="sv"><meta charset="utf-8"><div id="root"></div></html>' })
      requests.push(route.request().url())
      return route.abort()
    })
    await page.goto('https://kan115.test/')
    await page.addStyleTag({ content: css })
    await page.addScriptTag({ content: js })
    await page.evaluate(() => {
      window.neScrolls = []
      const scroll = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (options) {
        window.neScrolls.push({ id: this.id, ...options })
        return scroll.call(this, options)
      }
    })
    const nav = page.getByRole('navigation', { name: 'NE-vyns delar' })
    await expect(nav.getByRole('button')).toHaveCount(4)
    for (const [label, id, title] of [
      ['NE-bilagan', 'ne-figures', 'NE-bilagan'],
      ['Vägledning', 'ne-guide', 'Vägledning – från NE-underlag till deklaration'],
      ['Kontrollera NE-underlaget', 'ne-review', 'Kontrollera NE-underlaget'],
      ['Spara och historik', 'ne-documentation', 'Spara och historik'],
    ]) {
      const target = page.locator('#' + id)
      const card = id === 'ne-figures' ? target.locator('[data-ne-figures-card]') : target
      const focus = id === 'ne-figures' ? target : target.locator(':scope > summary')
      await expect(id === 'ne-figures' ? card.getByRole('heading', { name: title, exact: true }) : focus).toContainText(title)
      const button = nav.getByRole('button', { name: label, exact: true })
      if (width < 500) await button.tap()
      else await button.click()
      await expect(focus).toBeFocused()
      if (id !== 'ne-figures') await expect(target).toHaveAttribute('open', '')
      await expect(target).toBeInViewport()
      await expect.poll(() => card.evaluate(el => el.getAnimations().filter(a => a.id === 'ne-section-highlight').length)).toBe(1)
      const metrics = await card.evaluate(el => {
        const a = el.getAnimations().find(a => a.id === 'ne-section-highlight')
        const before = { width: el.offsetWidth, height: el.offsetHeight, top: el.offsetTop }
        a.pause(); a.currentTime = 900
        const middle = getComputedStyle(el).boxShadow
        a.currentTime = 1700
        const end = getComputedStyle(el).boxShadow
        return { before, after: { width: el.offsetWidth, height: el.offsetHeight, top: el.offsetTop }, middle, end, duration: a.effect.getTiming().duration }
      })
      assert.deepEqual(metrics.before, metrics.after, 'Highlight must not move or resize the card')
      assert.equal(metrics.duration, 1800)
      if (reducedMotion === 'reduce') assert.equal(metrics.middle, metrics.end)
      else assert.notEqual(metrics.middle, metrics.end, 'Normal highlight must fade')
      // Two clicks in one event turn must leave one freshly restarted animation.
      await button.evaluate(el => { el.click(); el.click() })
      await expect.poll(() => card.evaluate(el => {
        const animations = el.getAnimations().filter(a => a.id === 'ne-section-highlight')
        return animations.length === 1 && animations[0].playState === 'running' && animations[0].currentTime < 900
      })).toBe(true)
      // Enter and Space must both restart a nearly expired highlight.
      for (const key of ['Enter', 'Space']) {
        await card.evaluate(el => { window.previousNEHighlight = el.getAnimations().find(a => a.id === 'ne-section-highlight') })
        await button.focus()
        await button.press(key)
        await expect(focus).toBeFocused()
        await expect.poll(() => card.evaluate(el => {
          const a = el.getAnimations().find(a => a.id === 'ne-section-highlight')
          return a !== window.previousNEHighlight && a?.playState === 'running' && a.currentTime < 900 && window.previousNEHighlight.playState === 'idle'
        })).toBe(true)
        await expect(target).toBeInViewport()
      }
      assert.deepEqual(await page.evaluate(() => window.neScrolls.at(-1)), { id, block: 'start', behavior: reducedMotion === 'reduce' ? 'instant' : 'smooth' })
      await expect(target).toBeInViewport()
      if (id === 'ne-guide') {
        await expect(target.getByRole('navigation', { name: 'Guidens fem steg' }).getByRole('button')).toHaveCount(5)
        await page.screenshot({ path: `${output}/guide-${width}-${reducedMotion}.png` })
      }
    }
    await page.waitForTimeout(1900)
    assert.equal(await page.locator('#ne-documentation').evaluate(el => el.getAnimations().filter(a => a.id === 'ne-section-highlight').length), 0, 'Highlight must disappear automatically')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow')
    assert.equal(await page.evaluate(() => window.neWrites?.length ?? 0), 0, 'Navigation must not save anything')
    assert.deepEqual(errors, [])
    assert.deepEqual(requests, [])
    results.push({ width, reducedMotion, status: 'PASS', shortcuts: 4, repeatEnterSpace: true, noLayoutShift: true, noExternalRequests: true, noSaves: true })
    await page.close()
  }
  await writeFile(output + '/result.json', JSON.stringify({ status: 'PASS', results }, null, 2))
  console.log('PASS KAN-115: 4 sections × 3 widths × 2 motion preferences, pointer/touch/keyboard, repeated highlight, fade, cleanup and no layout shift. ' + output)
} finally {
  await browser.close()
}
