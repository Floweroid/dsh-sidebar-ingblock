/**
 * Client half of dsh-sidebar-ingblock.
 *
 * 1) One row in a session's "..." menu adds or removes that session.
 * 2) An inline "进行中" group rendered at the top of the sidebar's workspace
 *    list, above every workspace section.
 *
 * The shipped workspace browser owns `sidebar.workspaces` as a single slot and
 * declares no seat above its list, so the only way to add a group there without
 * forking the package is to host a node inside its scroll container and portal
 * React into it (the same approach dsh-pinned-sessions uses). The anchor is
 * re-asserted on a MutationObserver plus a slow interval, and the group stays
 * hidden while the region is a rail or shows search results.
 *
 * The list lives on the Host (see ./index.js): Desktop launches the Web app on
 * a fresh port each time, so browser storage would be lost on every restart.
 */
window.__ModuleLoader__.load({
  id: 'dsh-sidebar-ingblock',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let ReactDOM = null
    try {
      ReactDOM = require('react-dom')
    } catch (error) {
      console.warn('[dsh-sidebar-ingblock] react-dom unavailable; inline group disabled')
    }

    const NS = 'dsh.sidebarIngblock'
    const MENU_ITEM_ID = 'dsh.inprogress.toggle'
    const MENU_ITEM_ORDER = 150 // after the shipped pin (100), before rename (200)
    const RECONCILE_MS = 1500
    const HOST_ATTR = 'data-dsh-in-progress'

    const FALLBACK = {
      title: '进行中',
      add: '加入进行中',
      remove: '移出进行中',
      failed: '操作失败，请重试',
      unnamed: '未命名会话',
      unavailable: '会话信息尚未就绪',
      justNow: '刚刚',
      minutes: '{n} 分钟前',
      hours: '{n} 小时前',
      days: '{n} 天前',
      expand: '展开进行中',
      collapse: '收起进行中',
      expandWorkspace: '展开工作区',
      collapseWorkspace: '收起工作区',
    }

    const CSS = `
.dip-host {
  box-sizing: border-box;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 40vh;
  padding: 2px var(--dsh-sidebar-inline-padding, 12px) 0 0;
  margin-bottom: 4px;
}
.dip-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  padding: 0 8px 0 4px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  /* Same type as the official "工作区" section label: 14/20, tertiary. */
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dip-heading:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-secondary);
}
.dip-heading:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
.dip-slot {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 20px;
  color: var(--dsw-alias-label-tertiary);
}
.dip-slot-end { margin-left: 2px; }
.dip-arrow {
  display: inline-block;
  font-size: 10px;
  line-height: 1;
  transition: transform .15s ease-in-out;
}
.dip-arrow[data-collapsed='false'] { transform: rotate(90deg); }
.dip-heading-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dip-count {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.dip-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow-y: auto;
}
.dip-ws-toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-right: 4px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: 9px;
  line-height: 18px;
  cursor: pointer;
}
.dip-ws-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-primary);
}
.dip-ws-toggle:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
.dip-ws-toggle[aria-expanded='true'] { transform: rotate(90deg); }
/* Hover cue for the official "工作区" label, which this plugin makes foldable.
   Colour only: adding padding or a background would move the label inside the
   official header's flex row. */
.dip-ws-label {
  cursor: pointer;
  transition: color .12s ease-in-out;
}
.dip-ws-label:hover { color: var(--dsw-alias-label-secondary); }
@media (prefers-reduced-motion: reduce) {
  .dip-ws-label { transition: none; }
}
@media (prefers-reduced-motion: reduce) {
  .dip-arrow { transition: none; }
}
.dip-rowWrap {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: var(--dsw-radius-md, 8px);
}
.dip-rowWrap:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-1)); }
/* Insertion marker copied from the official list rows: a 12px box whose
   background stack draws a chevron cap plus the 2px line, positioned so the
   line falls inside the 2px gap between rows. */
.dip-rowWrap[data-drop='before']::before,
.dip-rowWrap[data-drop='after']::after {
  content: "";
  z-index: 1;
  pointer-events: none;
  position: absolute;
  left: 0;
  right: 4px;
  height: 12px;
  background:
    linear-gradient(55deg, transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)) 0 0 / 5px 7px no-repeat,
    linear-gradient(125deg, transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)) 0 5px / 5px 7px no-repeat,
    linear-gradient(var(--dsw-alias-state-business-primary) 0 0) 4px 5px / calc(100% - 4px) 2px no-repeat;
}
.dip-rowWrap[data-drop='before']::before { top: -7px; }
.dip-rowWrap[data-drop='after']::after { bottom: -7px; }
.dip-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--dsw-radius-md, 8px);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  user-select: none;
}
.dip-row:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));
  outline-offset: -2px;
}
.dip-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2);
}
.dip-dot[data-state='running'] { background: var(--dsw-alias-brand-primary); box-shadow: none; }
.dip-dot[data-state='pending'] { background: var(--dsw-alias-state-warn-primary); box-shadow: none; }
.dip-dot[data-state='unread'] { background: var(--dsw-alias-state-success-primary); box-shadow: none; }
/* A running Session breathes: the dot fades instead of spinning, so a glance
   at the sidebar reads "working" without drawing the eye like a loader. */
@keyframes dip-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}
.dip-dot[data-state='running'] { animation: dip-pulse 1.8s ease-in-out infinite; }
/* Must follow the animation rule: same specificity, so source order decides. */
@media (prefers-reduced-motion: reduce) {
  .dip-dot[data-state='running'] { animation: none; }
}
.dip-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dip-where {
  flex: none;
  max-width: 42%;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dip-remove {
  flex: none;
  width: 20px;
  height: 20px;
  margin-right: 6px;
  padding: 0;
  border: 0;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
  opacity: 0;
}
.dip-rowWrap:hover .dip-remove,
.dip-rowWrap:focus-within .dip-remove { opacity: 1; }
.dip-remove:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-primary);
}
.dip-row[data-archived='true'] {
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  cursor: default;
}
.dip-error {
  padding: 2px 8px 4px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 11px;
  line-height: 16px;
}
.dip-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}
.dip-menu-item:hover { background: var(--dsw-alias-bg-layer-2); }
.dip-menu-item:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -2px;
}
`

    // ---- state store -------------------------------------------------------

    /** @type {{ ready: boolean, entries: Array<{ sessionId: string, addedAt: number }>, collapsed: boolean, error: string | null }} */
    let current = { ready: false, entries: [], collapsed: false, workspaceCollapsed: false, error: null }
    /** Last entry list the Host returned (used to roll back a failed write). */
    let confirmed = null
    let inflightLoad = null
    /** Toggles run in click order; the Host serializes its own read-modify-write. */
    let toggleQueue = Promise.resolve()

    const listeners = new Set()

    function getSnapshot() {
      return current
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    function publish(next) {
      current = next
      for (const listener of [...listeners]) listener()
    }

    function endpoint(path) {
      return new URL(`dsh-inprogress/${path}`, document.baseURI).href
    }

    function normalizeEntries(payload) {
      const source = payload !== null && typeof payload === 'object' && Array.isArray(payload.entries)
        ? payload.entries
        : []
      const entries = []
      const seen = new Set()
      for (const item of source) {
        if (item === null || typeof item !== 'object') continue
        const sessionId = typeof item.sessionId === 'string' ? item.sessionId.trim() : ''
        if (sessionId === '' || seen.has(sessionId)) continue
        seen.add(sessionId)
        const addedAt = Number(item.addedAt)
        entries.push({ sessionId, addedAt: Number.isFinite(addedAt) ? addedAt : Date.now() })
      }
      return entries
    }

    /** Entries plus the persisted view state from one Host response. */
    function stateOf(payload) {
      return {
        entries: normalizeEntries(payload),
        collapsed: payload !== null && typeof payload === 'object' && payload.collapsed === true,
        workspaceCollapsed: payload !== null && typeof payload === 'object' && payload.workspaceCollapsed === true,
      }
    }

    /** Apply one Host response as the authoritative state. */
    function applyPayload(payload) {
      const next = stateOf(payload)
      confirmed = next.entries
      publish({
        ready: true,
        entries: next.entries,
        collapsed: next.collapsed,
        workspaceCollapsed: next.workspaceCollapsed,
        error: null,
      })
    }

    function load() {
      if (inflightLoad !== null) return inflightLoad
      inflightLoad = fetch(endpoint('state'), {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
        .then((response) => (response.ok
          ? response.json()
          : Promise.reject(new Error(`HTTP ${String(response.status)}`))))
        .then(applyPayload)
        .catch((error) => {
          console.error('dsh-sidebar-ingblock: state load failed', error)
          publish({ ...current, ready: false, error: 'load' })
        })
        .finally(() => {
          inflightLoad = null
        })
      return inflightLoad
    }

    /** Ask the Host to flip one id; the response is the authoritative list. */
    function requestToggle(sessionId, before) {
      return fetch(endpoint('toggle'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
        .then((response) => (response.ok
          ? response.json()
          : Promise.reject(new Error(`HTTP ${String(response.status)}`))))
        .then(applyPayload)
        .catch((error) => {
          console.error('dsh-sidebar-ingblock: toggle failed', error)
          publish({ ...current, entries: before, error: 'save' })
        })
    }

    function toggle(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return toggleQueue
      const before = current.entries
      const entries = before.some((entry) => entry.sessionId === sessionId)
        ? before.filter((entry) => entry.sessionId !== sessionId)
        : [{ sessionId, addedAt: Date.now() }, ...before]
      publish({ ...current, entries, error: null })
      toggleQueue = toggleQueue.then(() => requestToggle(sessionId, before))
      return toggleQueue
    }

    /**
     * Replace the whole list. Used to prune entries whose Session no longer
     * exists (deleted, or a different profile) once the Session catalog is
     * settled — never while it is still loading, which would wipe the list.
     */
    function replaceEntries(entries, before) {
      publish({ ...current, entries, error: null })
      return fetch(endpoint('state'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: 1, entries }),
      })
        .then((response) => (response.ok
          ? response.json()
          : Promise.reject(new Error(`HTTP ${String(response.status)}`))))
        .then(applyPayload)
        .catch((error) => {
          console.error('dsh-sidebar-ingblock: write failed', error)
          publish({ ...current, entries: before, error: 'save' })
        })
    }

    /**
     * Reorder one entry around another (drag and drop) and persist the new
     * order through the same full-replace path the prune uses.
     */
    function moveEntry(sourceId, targetId, position) {
      if (typeof sourceId !== 'string' || typeof targetId !== 'string' || sourceId === targetId) {
        return Promise.resolve()
      }
      const before = current.entries
      const from = before.findIndex((entry) => entry.sessionId === sourceId)
      if (from < 0) return Promise.resolve()
      const next = before.slice()
      const moved = next.splice(from, 1)[0]
      const target = next.findIndex((entry) => entry.sessionId === targetId)
      if (target < 0) return Promise.resolve()
      next.splice(position === 'after' ? target + 1 : target, 0, moved)
      if (next.every((entry, index) => entry.sessionId === before[index].sessionId)) {
        return Promise.resolve()
      }
      return replaceEntries(next, before)
    }

    /**
     * Persist view-state flags (`collapsed` for the group, `workspaceCollapsed`
     * for the official workspace list). Optimistic, reverted on failure.
     */
    function setUi(patch) {
      const before = { collapsed: current.collapsed, workspaceCollapsed: current.workspaceCollapsed }
      const next = {
        collapsed: typeof patch.collapsed === 'boolean' ? patch.collapsed : before.collapsed,
        workspaceCollapsed: typeof patch.workspaceCollapsed === 'boolean'
          ? patch.workspaceCollapsed
          : before.workspaceCollapsed,
      }
      if (next.collapsed === before.collapsed && next.workspaceCollapsed === before.workspaceCollapsed) {
        return Promise.resolve()
      }
      publish({ ...current, ...next, error: null })
      return fetch(endpoint('ui'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      })
        .then((response) => (response.ok
          ? response.json()
          : Promise.reject(new Error(`HTTP ${String(response.status)}`))))
        .then(applyPayload)
        .catch((error) => {
          console.error('dsh-sidebar-ingblock: view state save failed', error)
          publish({ ...current, ...before, error: 'save' })
        })
    }

    // ---- shared view helpers ----------------------------------------------

    function useSnapshot() {
      if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      }
      const [value, setValue] = React.useState(getSnapshot)
      React.useEffect(() => subscribe(() => setValue(getSnapshot())), [])
      return value
    }

    function useCloseMenu(hook) {
      const state = typeof hook === 'function' ? hook() : null
      const setOpen = state === null || state === undefined ? null : state[1]
      return React.useCallback(() => {
        if (typeof setOpen === 'function') setOpen(false)
      }, [setOpen])
    }

    function translator(props) {
      if (typeof props.t === 'function') return props.t
      return (key, params) => {
        const template = FALLBACK[key] ?? key
        if (params === undefined) return template
        return template.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
      }
    }

    function relativeLabel(time, t) {
      if (!Number.isFinite(time)) return ''
      const delta = Date.now() - time
      if (delta < 60_000) return t('justNow')
      const minutes = Math.floor(delta / 60_000)
      if (minutes < 60) return t('minutes', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('hours', { n: hours })
      return t('days', { n: Math.floor(hours / 24) })
    }

    function workspaceLabelOf(workspace) {
      if (workspace === null || workspace === undefined) return ''
      const title = typeof workspace.title === 'string' ? workspace.title.trim() : ''
      if (title !== '') return title
      const path = typeof workspace.path === 'string' ? workspace.path : ''
      if (path === '') return ''
      const parts = path.split(/[\\/]+/).filter((part) => part !== '')
      return parts.length === 0 ? path : parts[parts.length - 1]
    }

    /**
     * One row's leading dot state. `status` (from `useSessionStatus`) is the
     * live source for pending interactions and unread completions; the session
     * summary only carries the coarse running flag.
     */
    function rowState(summary, status) {
      if (status !== null && status !== undefined) {
        if (status.pendingInteraction !== undefined && status.pendingInteraction !== null) return 'pending'
        if (status.running === true) return 'running'
        if (status.completionUnread === true) return 'unread'
      }
      if (summary !== null && summary !== undefined && summary.running === true) return 'running'
      return 'idle'
    }

    // ---- region anchor -----------------------------------------------------
    // The workspace browser ships no seat above its list, so the group is
    // hosted in the shell's region row — the flex column that holds the
    // `sidebar.workspaces` outlet. The outlet itself is `display:contents`, so
    // the band and the browser become siblings: the band stays put while the
    // list scrolls, and it inherits the region's own rail/search visibility.

    function regionOf(outlet) {
      let region = outlet === null ? null : outlet.parentElement
      // A wrapper with `display:contents` generates no box; step out of it so
      // the band becomes a real flex item of the region row.
      if (region !== null && typeof window.getComputedStyle === 'function') {
        const display = window.getComputedStyle(region).display
        if (display === 'contents' || display === 'inline') region = region.parentElement
      }
      return region
    }

    /**
     * Own the band node plus the collapse control for the official workspace
     * list. The control is a small chevron next to the section label; folding
     * hides only the list, so the header stays as the way back.
     */
    function useRegionHost(active, workspaceCollapsed, onToggleWorkspace, labels) {
      const [host, setHost] = React.useState(null)
      const live = React.useRef({ workspaceCollapsed, onToggleWorkspace, labels })
      live.current = { workspaceCollapsed, onToggleWorkspace, labels }

      React.useEffect(() => {
        if (!active) {
          setHost(null)
          return undefined
        }
        const node = document.createElement('div')
        node.className = 'dip-host'
        node.setAttribute(HOST_ATTR, '')

        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'dip-ws-toggle'
        toggle.setAttribute('data-dip-ws-toggle', '')
        toggle.textContent = '▶'

        let attached = false
        let disposed = false
        let observer = null
        let watchedRegion = null
        let watchedHeader = null
        let watchedLabel = null
        let warned = false

        /** Reflect the current view state on the injected control. */
        const paintToggle = () => {
          const collapsed = live.current.workspaceCollapsed === true
          const text = collapsed ? live.current.labels.expand : live.current.labels.collapse
          toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
          toggle.setAttribute('aria-label', text)
          toggle.title = text
        }

        const onHeaderClick = (event) => {
          const target = event.target
          if (!(target instanceof Element)) return
          const collapsed = live.current.workspaceCollapsed === true
          if (target.closest('[data-dip-ws-toggle]') !== null
            || target.closest('[class*="sectionLabel"]') !== null) {
            event.preventDefault()
            event.stopPropagation()
            live.current.onToggleWorkspace()
            return
          }
          // Searching needs the list; open it again rather than search blind.
          if (collapsed && target.closest('[class*="search"]') !== null) {
            live.current.onToggleWorkspace()
          }
        }

        const detach = () => {
          if (node.parentNode !== null) node.parentNode.removeChild(node)
          if (attached) {
            attached = false
            setHost(null)
          }
        }

        const ensure = () => {
          if (disposed) return
          const region = regionOf(document.querySelector('[data-slot="sidebar.workspaces"]'))
          if (region === null) {
            detach()
            if (!warned) {
              warned = true
              console.warn('[dsh-sidebar-ingblock] sidebar region not found yet; retrying')
            }
            return
          }
          // Always first, even when React re-inserted the outlet before us.
          if (node.parentNode !== region || node !== region.firstElementChild) {
            region.insertBefore(node, region.firstChild)
          }
          if (!attached) {
            attached = true
            setHost(node)
          }

          const browser = Array.prototype.find.call(region.children, (child) => child !== node) ?? null
          const header = browser === null ? null : browser.querySelector('[class*="sectionHeader"]')
          const listArea = browser === null ? null : browser.querySelector('[class*="listArea"]')
          const label = header === null ? null : header.querySelector('[class*="sectionLabel"]')
          if (header !== null && label !== null && toggle.parentNode !== header) {
            label.insertAdjacentElement('afterend', toggle)
          }
          // The label is a fold control too, so it earns the same hover cue as
          // the chevron; the rest of the header keeps its own buttons.
          if (label !== null && label !== watchedLabel) {
            if (watchedLabel !== null) watchedLabel.classList.remove('dip-ws-label')
            label.classList.add('dip-ws-label')
            watchedLabel = label
          }
          if (header !== null && header !== watchedHeader) {
            if (watchedHeader !== null) watchedHeader.removeEventListener('click', onHeaderClick, true)
            header.addEventListener('click', onHeaderClick, true)
            watchedHeader = header
          }
          const collapsed = live.current.workspaceCollapsed === true
          if (listArea !== null) listArea.style.display = collapsed ? 'none' : ''
          if (browser !== null) browser.style.flex = collapsed ? '0 0 auto' : ''
          paintToggle()

          if (watchedRegion !== region) {
            if (observer !== null) observer.disconnect()
            observer = new MutationObserver(() => {
              ensure()
            })
            observer.observe(region, { childList: true })
            watchedRegion = region
          }
        }

        ensure()
        const timer = window.setInterval(ensure, RECONCILE_MS)
        return () => {
          disposed = true
          window.clearInterval(timer)
          if (observer !== null) observer.disconnect()
          observer = null
          if (watchedHeader !== null) watchedHeader.removeEventListener('click', onHeaderClick, true)
          watchedHeader = null
          if (watchedLabel !== null) watchedLabel.classList.remove('dip-ws-label')
          watchedLabel = null
          if (toggle.parentNode !== null) toggle.parentNode.removeChild(toggle)
          if (node.parentNode !== null) node.parentNode.removeChild(node)
          setHost(null)
        }
      }, [active])
      return host
    }

    // ---- inline group ------------------------------------------------------

    function InProgressSection(props) {
      const t = props.t
      const rows = props.rows
      const [dragging, setDragging] = React.useState(null)
      const [drop, setDrop] = React.useState(null)
      const dragged = React.useRef(null)

      const finishDrag = () => {
        dragged.current = null
        setDragging(null)
        setDrop(null)
      }

      const rowNodes = rows.map((row) => {
        const isDrop = drop !== null && drop.sessionId === row.sessionId
        return h('div', {
          key: row.sessionId,
          className: 'dip-rowWrap',
          'data-dragging': dragging === row.sessionId ? 'true' : 'false',
          'data-drop': isDrop ? drop.position : 'none',
          draggable: true,
          onDragStart: (event) => {
            dragged.current = row.sessionId
            setDragging(row.sessionId)
            event.dataTransfer.effectAllowed = 'move'
            // The payload also keeps Firefox from refusing the drag.
            event.dataTransfer.setData('text/plain', row.sessionId)
          },
          onDragOver: (event) => {
            if (dragged.current === null || dragged.current === row.sessionId) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            const rect = event.currentTarget.getBoundingClientRect()
            const position = event.clientY - rect.top > rect.height / 2 ? 'after' : 'before'
            if (drop === null || drop.sessionId !== row.sessionId || drop.position !== position) {
              setDrop({ sessionId: row.sessionId, position })
            }
          },
          onDrop: (event) => {
            event.preventDefault()
            const source = dragged.current ?? event.dataTransfer.getData('text/plain')
            const position = drop !== null && drop.sessionId === row.sessionId ? drop.position : 'before'
            finishDrag()
            if (source !== null && source !== '' && source !== row.sessionId) {
              props.onMove(source, row.sessionId, position)
            }
          },
          onDragEnd: finishDrag,
        },
        h('button', {
          type: 'button',
          className: 'dip-row',
          'data-archived': row.archived ? 'true' : 'false',
          'aria-grabbed': dragging === row.sessionId ? 'true' : 'false',
          title: row.meta === '' ? row.title : `${row.title} · ${row.meta}`,
          onClick: () => {
            if (!row.archived) props.open(row.sessionId)
          },
        },
        h('span', { className: 'dip-dot', 'data-state': row.state, 'aria-hidden': true }),
        h('span', { className: 'dip-title' }, row.title),
        row.archived
          ? h('span', { className: 'dip-where' }, t('archived'))
          : (row.meta === '' ? null : h('span', { className: 'dip-where' }, row.meta))),
        h('button', {
          type: 'button',
          className: 'dip-remove',
          'aria-label': t('remove'),
          title: t('remove'),
          onClick: () => {
            void toggle(row.sessionId)
          },
        }, '×'))
      })

      const heading = h('button', {
        type: 'button',
        className: 'dip-heading',
        'aria-expanded': props.collapsed ? 'false' : 'true',
        'aria-controls': 'dip-inprogress-rows',
        title: t(props.collapsed ? 'expand' : 'collapse'),
        onClick: () => props.onToggle(),
      },
      h('span', { className: 'dip-heading-title' }, t('title')),
      h('span', { className: 'dip-count' }, String(rows.length)),
      // The fold control sits at the row's right edge, like a header action.
      h('span', { className: 'dip-slot dip-slot-end' },
        h('span', {
          className: 'dip-arrow',
          'data-collapsed': props.collapsed ? 'true' : 'false',
          'aria-hidden': true,
        }, '▶')))

      return h('div', null,
        h('style', null, CSS),
        heading,
        props.error === null ? null : h('div', { className: 'dip-error', role: 'status' }, t('failed')),
        props.collapsed
          ? null
          : h('div', { className: 'dip-rows', id: 'dip-inprogress-rows', role: 'group' }, rowNodes))
    }

    function InProgressOverlay(props) {
      const snapshot = useSnapshot()
      const sessions = typeof props.useSessions === 'function' ? props.useSessions((state) => state) : null
      const workspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces((state) => state) : null
      // The band is a permanent part of the region: it shows the header (and
      // its collapse control) even while the list is empty.
      const t = translator(props)
      const host = useRegionHost(
        ReactDOM !== null,
        snapshot.workspaceCollapsed,
        () => {
          void setUi({ workspaceCollapsed: !snapshot.workspaceCollapsed })
        },
        { collapse: t('collapseWorkspace'), expand: t('expandWorkspace') },
      )
      const byId = sessions !== null && typeof sessions === 'object'
        && sessions.byId !== null && sessions.byId !== undefined
        ? sessions.byId
        : {}
      const statuses = typeof props.useSessionStatus === 'function' ? props.useSessionStatus((state) => state) : null
      const items = workspaces !== null && typeof workspaces === 'object' && Array.isArray(workspaces.items)
        ? workspaces.items
        : []
      const archivedIds = new Set(workspaces !== null && typeof workspaces === 'object'
        && Array.isArray(workspaces.archivedSessionIds)
        ? workspaces.archivedSessionIds
        : [])
      const order = sessions !== null && typeof sessions === 'object' && Array.isArray(sessions.ids)
        ? sessions.ids
        : null
      // The catalog reports `pending` until its baseline settles. Pruning on a
      // half-loaded catalog would drop every entry at cold start, so absence
      // only counts as "session gone" once the list is ready.
      const listReady = sessions === null || typeof sessions !== 'object'
        || sessions.phase === undefined || sessions.phase === 'ready'
      const open = typeof props.openSession === 'function' ? props.openSession : null

      // Drop ids the settled session catalog no longer knows about.
      const orderKey = order === null ? '' : order.join('|')
      React.useEffect(() => {
        if (!listReady || order === null || order.length === 0) return
        const known = new Set(order)
        const before = current.entries
        const next = before.filter((entry) => known.has(entry.sessionId))
        if (next.length === before.length) return
        void replaceEntries(next, before)
      }, [orderKey, listReady])

      const rows = snapshot.entries.map((entry) => {
        const summary = byId[entry.sessionId]
        const workspace = items.find((item) => Array.isArray(item.sessionIds)
          && item.sessionIds.includes(entry.sessionId))
        const titled = summary !== undefined && typeof summary.title === 'string' && summary.title.trim() !== ''
        return {
          sessionId: entry.sessionId,
          title: titled ? summary.title.trim() : (summary === undefined ? '…' : t('unnamed')),
          meta: workspaceLabelOf(workspace),
          state: rowState(
            summary,
            statuses !== null && typeof statuses.get === 'function' ? statuses.get(entry.sessionId) : undefined,
          ),
          archived: archivedIds.has(entry.sessionId),
        }
      })

      if (host === null || open === null) return null
      return ReactDOM.createPortal(
        h(InProgressSection, {
          key: 'section',
          t,
          rows,
          open,
          collapsed: snapshot.collapsed,
          error: snapshot.error,
          onMove: (source, target, position) => {
            void moveEntry(source, target, position)
          },
          onToggle: () => {
            void setUi({ collapsed: !snapshot.collapsed })
          },
        }),
        host,
      )
    }

    // ---- menu row ----------------------------------------------------------

    function ToggleRow(props) {
      const snapshot = useSnapshot()
      const closeMenu = useCloseMenu(props.useMenuOpenState)
      const t = translator(props)
      const inList = snapshot.entries.some((entry) => entry.sessionId === props.sessionId)
      return h(
        React.Fragment,
        null,
        h('style', { key: 'dip-style' }, CSS),
        h('button', {
          key: 'dip-row',
          type: 'button',
          role: 'menuitem',
          className: 'dip-menu-item',
          title: snapshot.error === null ? undefined : t('failed'),
          onClick: () => {
            closeMenu()
            void toggle(props.sessionId)
          },
        }, t(inList ? 'remove' : 'add')),
      )
    }

    return {
      name: 'dsh-sidebar-ingblock',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, {
          zh: {
            title: '进行中',
            add: '加入进行中',
            remove: '移出进行中',
            failed: '操作失败，请重试',
            unnamed: '未命名会话',
            unavailable: '会话信息尚未就绪',
            archived: '已归档',
            justNow: '刚刚',
            minutes: '{n} 分钟前',
            hours: '{n} 小时前',
            days: '{n} 天前',
            expand: '展开进行中',
            collapse: '收起进行中',
            expandWorkspace: '展开工作区',
            collapseWorkspace: '收起工作区',
          },
          en: {
            title: 'In Progress',
            add: 'Add to In Progress',
            remove: 'Remove from In Progress',
            failed: 'Action failed, try again',
            unnamed: 'Untitled session',
            unavailable: 'Session details loading',
            archived: 'Archived',
            justNow: 'just now',
            minutes: '{n} min ago',
            hours: '{n} h ago',
            days: '{n} d ago',
            expand: 'Expand In Progress',
            collapse: 'Collapse In Progress',
            expandWorkspace: 'Expand workspaces',
            collapseWorkspace: 'Collapse workspaces',
          },
        }), 'dsh-sidebar-ingblock: dictionaries')

        function openSession(sessionId) {
          const service = ctx.get('uiWorkspace') ?? ctx.get('workspace')
          if (service !== null && service !== undefined && typeof service.openSession === 'function') {
            service.openSession(sessionId)
            return
          }
          console.warn('[dsh-sidebar-ingblock] uiWorkspace.openSession is unavailable')
        }

        // Warm the store so the first paint already knows the membership.
        void load()

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh.inprogress',
          order: 20,
          locale: NS,
          inject: () => ({ openSession }),
        }, InProgressOverlay))

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
          name: 'sidebar.workspaces.session.menu.item',
          id: MENU_ITEM_ID,
          order: MENU_ITEM_ORDER,
          locale: NS,
        }, ToggleRow))
      },
    }
  },
})
