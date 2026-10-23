# dsh-sidebar-ingblock

A collapsible **"In Progress"** group for the DSH Web sidebar: collect sessions from each session row's `...` menu, pin the shortlist above the workspace list, reorder by dragging, and keep it across restarts.

[中文说明](README.md)

![In Progress group](docs/sidebar-hover.png)

<sub>The group sits above the workspace list: a status dot per row (amber = waiting, blue = running, green = finished-unread, grey ring = idle) and the owning workspace on the right. Hovering a row reveals a trailing `×` that removes it; the workspace area is folded to a single header row.</sub>

## What it does

- **Add / remove** — a new row in every session's `...` menu ("Add to In Progress" / "Remove from In Progress"), placed between Pin and Rename.
- **Independent group** — the group sits above the `工作区` (workspaces) header and does not scroll with the session list; searching or folding workspaces leaves it alone.
- **Collapsible** — click the group title or its chevron; the count stays visible and the state survives restarts.
- **Workspace area collapse** — a chevron next to the `工作区` label folds the whole workspace list (header stays as the way back); clicking search auto-expands it.
- **Drag to reorder** — drop on the upper/lower half of a row; the insertion line matches DSH's own list visuals.
- **Status dot** — waiting (amber), running (slow blue breathing), finished-unread (green), idle (grey ring).
- **Archive and cleanup** — archived sessions are dimmed and not openable; deleted sessions are pruned automatically.
- **Visible failures** — a failed write rolls back and shows an inline error.

## Install

```sh
# local directory (development)
dsh plugin --profile <profile> add /path/to/dsh-sidebar-ingblock

# packed tarball (distribution)
npm pack && dsh plugin --profile <profile> add ./dsh-sidebar-ingblock-0.1.0.tgz

# git spec (pnpm supports it; not verified on this machine)
dsh plugin --profile <profile> add 'git+https://<host>/<user>/dsh-sidebar-ingblock.git'
```

Refresh the page afterwards. Changes to `index.js` (Host half) need a DSH restart or a Plugin Manager re-apply of the row.

Hovering a row reveals a trailing `×` that removes it without opening the menu.

## Data

State lives in `$DSH_HOME/plugin-data/dsh-sidebar-ingblock/state.json` (default `~/.dsh/...`), written by the Host half — never browser storage. Only session ids, their add time, and two fold flags are stored; titles and statuses are read live from the host. No network calls.

## Compatibility

Tested against **DSH 0.2.1-rc.2 / desktop profile (Windows)**. The inline group and the workspace fold control rely on internal sidebar markup (`[data-slot="sidebar.workspaces"]`, `sectionHeader`, `sectionLabel`, `listArea`). A UI refactor degrades gracefully — the group or the fold arrow may disappear, the rest of the sidebar keeps working, and the console logs a warning.

## License

MIT
