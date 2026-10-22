#!/usr/bin/env node
/**
 * Release self-check: verifies the pieces `npm pack` ships are coherent.
 *
 * Run with `npm test` before tagging or publishing. It prints every failed
 * check (not just the first) and exits non-zero when anything fails.
 */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')
const failures = []

/** Read one file from the package root. */
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

/** Run one named check. */
function check(label, run) {
  try {
    const detail = run()
    console.log(`ok    ${label}${typeof detail === 'string' && detail !== '' ? ` — ${detail}` : ''}`)
  } catch (error) {
    failures.push(`${label}: ${error.message}`)
    console.log(`FAIL  ${label} — ${error.message}`)
  }
}

/** Fail with a message unless `condition` holds. */
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const manifest = JSON.parse(read('package.json'))
const clientSource = read('client.js')
const hostSource = read('index.js')
const patchSource = read('cordis.patch.yml')

check('manifest shape', () => {
  assert(typeof manifest.name === 'string' && manifest.name !== '', 'name is missing')
  assert(/^\d+\.\d+\.\d+/.test(manifest.version), `version ${JSON.stringify(manifest.version)} is not semver`)
  assert(manifest.type === 'module', 'type must be "module"')
  assert(manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch, 'dsh.bundle.patch is missing')
  assert(manifest.dsh.client && manifest.dsh.client.platform === 'web', 'dsh.client.platform must be "web"')
  return `${manifest.name}@${manifest.version}`
})

check('bundle patch points at this package', () => {
  assert(patchSource.includes('- insert:'), 'patch has no insert block')
  assert(patchSource.includes(`name: '${manifest.name}'`), `patch does not name ${manifest.name}`)
  return manifest.dsh.bundle.patch
})

check('declared files exist', () => {
  const missing = manifest.files.filter((entry) => !entry.includes('*') && !fs.existsSync(path.join(root, entry)))
  assert(missing.length === 0, `missing: ${missing.join(', ')}`)
  return `${manifest.files.length} entries`
})

check('client bundle parses', () => {
  // A plain script (no import/export): parse it without running it, so no DOM
  // or loader global is needed.
  new vm.Script(clientSource, { filename: 'client.js' })
  return 'client.js'
})

check('client bundle identity matches the package', () => {
  assert(clientSource.includes('window.__ModuleLoader__.load('), 'client.js is not a Module Loader bundle')
  assert(clientSource.includes(`id: '${manifest.name}'`), `bundle id does not match ${manifest.name}`)
  assert(clientSource.includes(`name: '${manifest.name}'`), `client module name is not ${manifest.name}`)
  return manifest.name
})

check('host half exposes the plugin contract', () => {
  assert(hostSource.includes('export function apply('), 'index.js does not export apply')
  assert(hostSource.includes("export const inject = ['webServer']"), 'index.js does not inject webServer')
  return 'apply + inject'
})

check('routes agree between the halves', () => {
  for (const route of ['state', 'toggle', 'ui']) {
    assert(hostSource.includes(`/${route}`), `host half has no ${route} route`)
    assert(clientSource.includes(`endpoint('${route}')`), `client half never calls ${route}`)
  }
  return 'state, toggle, ui'
})

check('client never hardcodes an origin', () => {
  assert(!/https?:\/\/127\.0\.0\.1|https?:\/\/localhost/.test(clientSource), 'client.js hardcodes a local origin')
  assert(clientSource.includes('new URL(`dsh-inprogress/'), 'client.js does not resolve endpoints against baseURI')
  return 'relative to document.baseURI'
})

check('shipped files contain no absolute home paths', () => {
  const offenders = ['index.js', 'client.js'].filter((file) => /[A-Za-z]:\\\\Users\\\\|\/Users\/[^/\s]+/.test(read(file)))
  assert(offenders.length === 0, `absolute paths in ${offenders.join(', ')}`)
  return 'clean'
})

check('locale metadata is present', () => {
  for (const locale of ['zh', 'en']) {
    const data = JSON.parse(read(`locale/${locale}.json`))
    assert(data.meta && typeof data.meta.title === 'string' && data.meta.title !== '', `${locale}: meta.title missing`)
    assert(typeof data.meta.description === 'string' && data.meta.description !== '', `${locale}: meta.description missing`)
  }
  return 'zh, en'
})

check('icon is a parseable SVG', () => {
  const svg = read('icon.svg')
  assert(svg.startsWith('<svg'), 'icon.svg does not start with <svg')
  assert(svg.includes('viewBox'), 'icon.svg has no viewBox')
  return `${Buffer.byteLength(svg)} bytes`
})

// Importing the Host half validates its ESM syntax; nothing is applied because
// `apply` only runs when the Loader calls it.
import(pathToFileURL(path.join(root, 'index.js')).href)
  .then(() => console.log('ok    host module imports — index.js'))
  .catch((error) => {
    failures.push(`host module imports: ${error.message}`)
    console.log(`FAIL  host module imports — ${error.message}`)
  })
  .finally(() => {
    if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed`)
      process.exitCode = 1
      return
    }
    console.log('\nall checks passed')
  })
