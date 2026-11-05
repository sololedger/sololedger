import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import Layout from './src/components/Layout'
      function TestApp() {
        const [tab, setTab] = useState('dashboard')
        return <Layout activeTab={tab} setActiveTab={setTab}
          isAdmin={location.search === '?admin'} onLogout={() => setTab('logged-out')}>
          <button id="outside">Utanför menyn</button><output>{tab}</output>
        </Layout>
      }
      createRoot(document.getElementById('root')).render(<TestApp />)
    `,
    loader: 'tsx',
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'browser',
})
const css = (await postcss([tailwind({ base: process.cwd() })]).process(
  await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' }
)).css
const html = `<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`
const primary = ['Bokföring', 'Bokföringskategorier', 'Fakturor', 'Moms', 'Inventarier']
const yearEnd = ['Årsavslut', 'Bokslutsskulder', 'NE-bilaga']
const other = ['Hjälp & FAQ', 'Profil']
const browser = await chromium.launch()
try {
  for (const width of [1440, 1280, 1024, 1023, 390, 320]) {
    const desktop = width >= 1024
    const admin = width === 1024 || width === 390
    const page = await browser.newPage({ viewport: { width, height: 820 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => route.request().url().startsWith('https://menu.test/')
      ? route.fulfill({ contentType: 'text/html', body: html })
      : route.abort())
    await page.goto(`https://menu.test/${admin ? '?admin' : ''}`)

    const nav = page.getByRole('navigation', { name: 'Huvudmeny' })
    const button = name => nav.getByRole('button', { name, exact: true })
    const group = nav.getByRole('group', { name: 'Bokslut och deklaration' })
    const more = button('Mer')
    const mobile = page.getByRole('button', { name: 'Öppna meny', exact: true })
    const checkWidth = async () => assert.ok(await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    ), `Horisontell sidscroll vid ${width}px`)

    if (desktop) {
      await expect(nav.getByRole('button')).toHaveText([...primary, /Mer/, 'Logga ut'])
      await expect(button('Moms')).toBeInViewport({ ratio: 1 })
      await button('Moms').click()
      await expect(button('Moms')).toHaveAttribute('aria-current', 'page')
      await checkWidth()

      await more.focus()
      await page.keyboard.press('ArrowDown')
      const item = name => nav.getByRole('menuitem', { name, exact: true })
      await expect(group.getByRole('menuitem')).toHaveText(yearEnd)
      await expect(nav.getByRole('menuitem')).toHaveText([...yearEnd, ...other, ...(admin ? ['Admin'] : [])])
      await expect(item('Årsavslut')).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await expect(item('Bokslutsskulder')).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('Enter')
      await expect(page.locator('output')).toHaveText('ne')
      await expect(more).toBeFocused()
      await expect(more).toHaveAttribute('aria-current', 'true')

      await more.click()
      await expect(item('NE-bilaga')).toHaveAttribute('aria-current', 'page')
      await checkWidth()
      await page.keyboard.press('Escape')
      await expect(more).toBeFocused()
      await expect(more).toHaveAttribute('aria-expanded', 'false')

      await more.click()
      await expect(item('Årsavslut')).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(button('Logga ut')).toBeFocused()
      await expect(more).toHaveAttribute('aria-expanded', 'false')

      await more.click()
      await page.locator('#outside').click()
      await expect(more).toHaveAttribute('aria-expanded', 'false')
    } else {
      await mobile.focus()
      await page.keyboard.press('Enter')
      await expect(nav.getByRole('button')).toHaveText([...primary, ...yearEnd, ...other, ...(admin ? ['Admin'] : []), 'Logga ut'])
      await expect(group.getByRole('button')).toHaveText(yearEnd)
      await checkWidth()
      await page.keyboard.press('Tab')
      await expect(button('Bokföring')).toBeFocused()
      await button('Bokslutsskulder').click()
      await expect(page.locator('output')).toHaveText('leverantorsskulder')
      await expect(mobile).toBeFocused()

      await mobile.click()
      await expect(button('Bokslutsskulder')).toHaveAttribute('aria-current', 'page')
      await button('Bokslutsskulder').focus()
      await page.keyboard.press('Escape')
      await expect(mobile).toBeFocused()
      await expect(nav).toHaveCount(0)
      await mobile.click()
    }

    await button('Logga ut').click()
    await expect(page.locator('output')).toHaveText('logged-out')
    assert.deepEqual(errors, [])
    console.log(`PASS ${width}px ${desktop ? 'dator' : 'mobilmeny'}${admin ? ', admin' : ''}`)
    await page.close()
  }
} finally {
  await browser.close()
}
