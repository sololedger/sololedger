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
      window.neArrivalProbes = []
      const scroll = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function (options) {
        window.neScrolls.push({ id: this.id, ...options })
        const result = scroll.call(this, options)
        const card = this.querySelector('[data-ne-figures-card]') ?? this
        const top = () => this.getBoundingClientRect().top
        const samples = []; window.neArrivalProbes.push(samples)
        function sample(now) {
          const a = card.getAnimations({ subtree: true }).find(a => a.id === 'ne-section-highlight')
          if (!a) return
          samples.push({ now, top: top(), state: a.playState, time: a.currentTime, opacity: getComputedStyle(card, '::after').opacity })
          if (a.playState !== 'running') requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
        return result
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
      await expect.poll(() => card.evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.id === 'ne-section-highlight').length)).toBe(1)
      await expect.poll(() => card.evaluate(el => el.getAnimations({ subtree: true }).find(a => a.id === 'ne-section-highlight')?.playState)).toBe('running')
      const arrival = await page.evaluate(() => window.neArrivalProbes.at(-1))
      assert(arrival.length >= 8, 'Arrival must wait for a stable viewport, including reduced-motion')
      for (const sample of arrival.slice(0, -1)) {
        assert.equal(sample.state, 'paused', 'No fading during scroll')
        assert.equal(sample.time, 0, 'The hold countdown must not run during scroll')
        assert.equal(sample.opacity, '1', 'Keep the whole-card tint at full strength during scroll')
      }
      let lastMovement = arrival[0].now
      for (let i = 1; i < arrival.length; i++) if (Math.abs(arrival[i].top - arrival[i - 1].top) > 0.5) lastMovement = arrival[i].now
      assert(arrival.at(-1).now - lastMovement >= 150, 'Countdown starts after scrolling settles')
      const metrics = await card.evaluate(el => {
        const a = el.getAnimations({ subtree: true }).find(a => a.id === 'ne-section-highlight')
        const before = { width: el.offsetWidth, height: el.offsetHeight, top: el.offsetTop }
        a.pause(); a.currentTime = 2900
        const middle = getComputedStyle(el, '::after').opacity
        const style = getComputedStyle(el, '::after')
        a.currentTime = a.effect.getTiming().duration - 100
        const end = getComputedStyle(el, '::after').opacity
        return { before, after: { width: el.offsetWidth, height: el.offsetHeight, top: el.offsetTop }, middle, end, tint: style.backgroundColor, edge: style.boxShadow, pointerEvents: style.pointerEvents, duration: a.effect.getTiming().duration }
      })
      assert.deepEqual(metrics.before, metrics.after, 'Highlight must not move or resize the card')
      assert.equal(metrics.duration, reducedMotion === 'reduce' ? 3000 : 3400)
      assert.equal(metrics.middle, '1', 'Full highlight remains for three seconds after arrival')
      assert.equal(metrics.tint, 'rgba(16, 185, 129, 0.08)')
      assert.match(metrics.edge, /rgb\(5, 150, 105\).*inset|inset.*rgb\(5, 150, 105\)/)
      assert.equal(metrics.pointerEvents, 'none')
      if (reducedMotion === 'reduce') assert.equal(metrics.middle, metrics.end)
      else assert.notEqual(metrics.middle, metrics.end, 'Normal highlight must fade')
      // Two clicks in one event turn must leave one freshly restarted animation.
      await button.evaluate(el => { el.click(); el.click() })
      await expect.poll(() => card.evaluate(el => {
        const animations = el.getAnimations({ subtree: true }).filter(a => a.id === 'ne-section-highlight')
        return animations.length === 1 && animations[0].playState === 'running' && animations[0].currentTime < 900
      }), { intervals: [16, 32, 64] }).toBe(true)
      await expect(page.locator('.ne-navigation-highlight')).toHaveCount(1)
      // Enter and Space must both restart a nearly expired highlight.
      for (const key of ['Enter', 'Space']) {
        await card.evaluate(el => { window.previousNEHighlight = el.getAnimations({ subtree: true }).find(a => a.id === 'ne-section-highlight') })
        await button.focus()
        await button.press(key)
        await expect(focus).toBeFocused()
        await expect.poll(() => card.evaluate(el => {
          const a = el.getAnimations({ subtree: true }).find(a => a.id === 'ne-section-highlight')
          return a !== window.previousNEHighlight && a?.playState === 'running' && a.currentTime < 900 && window.previousNEHighlight.playState === 'idle'
        }), { intervals: [16, 32, 64] }).toBe(true)
        await expect(target).toBeInViewport()
      }
      assert.deepEqual(await page.evaluate(() => window.neScrolls.at(-1)), { id, block: 'start', behavior: reducedMotion === 'reduce' ? 'instant' : 'smooth' })
      await expect(target).toBeInViewport()
      if (id === 'ne-guide') {
        await expect(target.getByRole('navigation', { name: 'Guidens fem steg' }).getByRole('button')).toHaveCount(5)
        await page.screenshot({ path: `${output}/guide-${width}-${reducedMotion}.png` })
      }
    }
    await page.waitForTimeout(3600)
    assert.equal(await page.locator('#ne-documentation').evaluate(el => el.getAnimations({ subtree: true }).filter(a => a.id === 'ne-section-highlight').length), 0, 'Highlight must disappear automatically')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow')
    assert.equal(await page.evaluate(() => window.neWrites?.length ?? 0), 0, 'Navigation must not save anything')
    assert.deepEqual(errors, [])
    assert.deepEqual(requests, [])
    await expect(page.locator('.ne-navigation-highlight')).toHaveCount(0)
    // A navigation interrupted by unmount must release its pending animation/frame.
    await nav.getByRole('button', { name: 'Vägledning', exact: true }).evaluate(el => el.click())
    await page.evaluate(() => window.neHarness.set({ owner: 'synthetic-b' }))
    await page.waitForTimeout(300)
    await expect(page.locator('.ne-navigation-highlight')).toHaveCount(0)
    results.push({ width, reducedMotion, status: 'PASS', shortcuts: 4, threeSecondsAfterScroll: true, fullCardTint: true, repeatEnterSpace: true, noLayoutShift: true, noExternalRequests: true, noSaves: true })
    await page.close()
  }
  await writeFile(output + '/result.json', JSON.stringify({ status: 'PASS', results }, null, 2))
  console.log('PASS KAN-115: 4 sections × 3 widths × 2 motion preferences, pointer/touch/keyboard, repeated highlight, fade, cleanup and no layout shift. ' + output)
} finally {
  await browser.close()
}
