/**
 * Host half of dsh-sidebar-ingblock.
 *
 * Owns the durable "in progress" list and serves it to the browser half over
 * one same-origin, connection-fenced route. The list is user data, so it must
 * not live in browser storage: Desktop launches the Web app with `--port 0`,
 * which gives every launch a different origin.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The Web app is the only consumer; without it this plugin has nothing to do. */
export const inject = ['webServer']

const STATE_VERSION = 1
const MAX_ENTRIES = 500
const MAX_BODY_BYTES = 64 * 1024
const ROUTE_PREFIX = '/dsh-inprogress'
const STATE_PATH = `${ROUTE_PREFIX}/state`
const TOGGLE_PATH = `${ROUTE_PREFIX}/toggle`
const UI_PATH = `${ROUTE_PREFIX}/ui`

/** Root of the harness home; `DSH_HOME` wins when the launcher set it. */
function harnessHome() {
  const fromEnvironment = process.env.DSH_HOME
  if (typeof fromEnvironment === 'string' && fromEnvironment.trim() !== '') return fromEnvironment
  return join(homedir(), '.dsh')
}

/** An empty, well-formed state. */
function emptyState() {
  return { version: STATE_VERSION, updatedAt: 0, collapsed: false, workspaceCollapsed: false, entries: [] }
}

/** One valid session id, or `undefined`. */
function sessionIdOf(value) {
  if (typeof value !== 'string') return undefined
  const sessionId = value.trim()
  if (sessionId === '' || sessionId.length > 200) return undefined
  return sessionId
}

/**
 * Coerce arbitrary input into the stored shape. Unknown fields are dropped,
 * duplicate ids keep their first position, and malformed rows are skipped —
 * a corrupted file must never break the sidebar. `collapsed` is carried over
 * from `previous` when the input does not name it, so replacing the entry list
 * never resets the view state.
 */
function normalize(input, previous) {
  const source = input !== null && typeof input === 'object' && Array.isArray(input.entries)
    ? input.entries
    : []
  const entries = []
  const seen = new Set()
  for (const item of source) {
    if (item === null || typeof item !== 'object') continue
    const sessionId = sessionIdOf(item.sessionId)
    if (sessionId === undefined || seen.has(sessionId)) continue
    seen.add(sessionId)
    const addedAt = Number(item.addedAt)
    entries.push({ sessionId, addedAt: Number.isFinite(addedAt) ? addedAt : Date.now() })
    if (entries.length >= MAX_ENTRIES) break
  }
  const record = input !== null && typeof input === 'object' ? input : {}
  /** A declared boolean wins; otherwise the previous value survives. */
  const flag = (name) => {
    if (typeof record[name] === 'boolean') return record[name]
    return previous !== undefined && previous !== null && previous[name] === true
  }
  return {
    version: STATE_VERSION,
    updatedAt: Date.now(),
    collapsed: flag('collapsed'),
    workspaceCollapsed: flag('workspaceCollapsed'),
    entries,
  }
}

/** Read one request body, refusing oversized payloads. */
async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
    size += bytes.length
    if (size > MAX_BODY_BYTES) throw new Error('body-too-large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Write one JSON response. */
function send(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
  })
  response.end(body)
}

/**
 * Plugin body: load the state lazily, keep it in memory, and persist it
 * atomically on every accepted write. Mutations run through one queue so two
 * concurrent requests cannot lose each other's change.
 */
export function apply(ctx) {
  const directory = join(harnessHome(), 'plugin-data', 'dsh-sidebar-ingblock')
  const file = join(directory, 'state.json')
  /** Location used before the package was renamed; adopted once on first load. */
  const legacyFile = join(harnessHome(), 'plugin-data', 'dsh-sidebar-inprogress', 'state.json')

  /** @type {ReturnType<typeof emptyState> | undefined} */
  let cached
  /** @type {Promise<unknown>} */
  let mutationQueue = Promise.resolve()

  async function loadState() {
    if (cached !== undefined) return cached
    try {
      const text = await readFile(file, 'utf8')
      cached = normalize(JSON.parse(text))
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') {
        // A rename must not cost the user their shortlist: move the old file
        // over once, then continue from the new location.
        try {
          await mkdir(directory, { recursive: true })
          await rename(legacyFile, file)
          cached = normalize(JSON.parse(await readFile(file, 'utf8')))
          return cached
        } catch {
          cached = emptyState()
        }
      } else {
        // Keep the unusable bytes for inspection, then continue empty.
        await rename(file, `${file}.bad-${Date.now()}`).catch(() => {})
        ctx.logger?.warn?.(`dsh-sidebar-ingblock: unreadable state, starting empty: ${String(error)}`)
        cached = emptyState()
      }
    }
    return cached
  }

  async function writeState(next) {
    await mkdir(directory, { recursive: true })
    const temporary = `${file}.tmp`
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await rename(temporary, file)
    cached = next
    return next
  }

  /** Serialize every read-modify-write so one request cannot overwrite another. */
  function enqueue(operation) {
    const run = mutationQueue.then(operation, operation)
    mutationQueue = run.then(() => undefined, () => undefined)
    return run
  }

  async function toggleEntry(sessionId) {
    const current = await loadState()
    const exists = current.entries.some((entry) => entry.sessionId === sessionId)
    const entries = exists
      ? current.entries.filter((entry) => entry.sessionId !== sessionId)
      : [{ sessionId, addedAt: Date.now() }, ...current.entries]
    if (!exists && entries.length > MAX_ENTRIES) throw new Error('too-many-entries')
    return writeState({
      version: STATE_VERSION,
      updatedAt: Date.now(),
      collapsed: current.collapsed === true,
      workspaceCollapsed: current.workspaceCollapsed === true,
      entries,
    })
  }

  /** Store view-state flags without touching the entry list. */
  async function setViewState(patch) {
    const current = await loadState()
    const collapsed = typeof patch.collapsed === 'boolean' ? patch.collapsed : current.collapsed === true
    const workspaceCollapsed = typeof patch.workspaceCollapsed === 'boolean'
      ? patch.workspaceCollapsed
      : current.workspaceCollapsed === true
    if (collapsed === (current.collapsed === true)
      && workspaceCollapsed === (current.workspaceCollapsed === true)) return current
    return writeState({
      version: STATE_VERSION,
      updatedAt: Date.now(),
      collapsed,
      workspaceCollapsed,
      entries: current.entries,
    })
  }

  const handler = async (request, response) => {
    // Match the route before the fence: a path this plugin does not serve is a
    // plain 404, not a statement about the caller's credentials. Everything
    // that touches state runs only after the connection admits the request.
    let pathname = ''
    try {
      pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    } catch {
      pathname = ''
    }
    const known = pathname === STATE_PATH || pathname === TOGGLE_PATH || pathname === UI_PATH
    if (!known) {
      send(response, 404, { error: 'not-found' })
      return
    }

    const rejection = ctx.get('connection')?.requestRejection?.(request)
    if (rejection !== undefined) {
      send(response, rejection, { error: 'rejected' })
      return
    }

    try {
      if (pathname === STATE_PATH && request.method === 'GET') {
        send(response, 200, await loadState())
        return
      }
      if (pathname === STATE_PATH && request.method === 'POST') {
        const parsed = JSON.parse(await readBody(request))
        // Keep the stored view state when the body only replaces the entries.
        send(response, 200, await enqueue(async () => {
          const previous = await loadState()
          return writeState(normalize(parsed, previous))
        }))
        return
      }
      if (pathname === TOGGLE_PATH && request.method === 'POST') {
        const parsed = JSON.parse(await readBody(request))
        const sessionId = sessionIdOf(parsed === null || typeof parsed !== 'object' ? undefined : parsed.sessionId)
        if (sessionId === undefined) {
          send(response, 400, { error: 'invalid-session-id' })
          return
        }
        send(response, 200, await enqueue(() => toggleEntry(sessionId)))
        return
      }
      if (pathname === UI_PATH && request.method === 'POST') {
        const parsed = JSON.parse(await readBody(request))
        const record = parsed !== null && typeof parsed === 'object' ? parsed : {}
        const patch = {}
        for (const name of ['collapsed', 'workspaceCollapsed']) {
          if (typeof record[name] === 'boolean') patch[name] = record[name]
        }
        if (Object.keys(patch).length === 0) {
          send(response, 400, { error: 'invalid-view-state' })
          return
        }
        send(response, 200, await enqueue(() => setViewState(patch)))
        return
      }
      send(response, 405, { error: 'method-not-allowed' })
    } catch (error) {
      send(response, 400, { error: 'invalid-state', message: String(error?.message ?? error) })
    }
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }),
    'dsh-sidebar-ingblock: state route',
  )
}
