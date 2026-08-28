# Modernization Assessment — claude-code-practice

> **Scope note:** `/modernize-assess` is designed for a `legacy/<system>` estate.
> This repository has no `legacy/` structure — it *is* the system, a small
> Claude Code practice project. By user direction, this assessment targets
> the repository root directly instead of `legacy/$1`.

## Executive Summary

`claude-code-practice` is a ~650-line, dependency-free vanilla HTML/CSS/JS
TODO list app (no build system, no server, no tests) that persists state to
browser `localStorage`. It is small and low-risk: the security scan found no
Critical/High issues (only Low/Info hardening suggestions relevant if the
trust model ever changes), and the codebase has no dangling references or
dead files. The main finding is architectural, not correctness: a single
~150-line `render()` function does five jobs at once, which has already
produced one real, user-facing bug (the new inline-edit box isn't
auto-focused) and makes the next feature riskier to add. **Headline
recommendation:** targeted in-place refactor of `render()` and
`saveTodos()` — not a platform or stack change.

## System Inventory

Tooling: `scc`/`cloc`/`lizard` are not installed in this environment;
figures below use `find` + `wc -l` grouped by extension, and a decision­
keyword count as a complexity proxy (documented in the command's fallback
path).

| File | Lines | Role |
|---|---|---|
| `app.js` | 309 | State, persistence, rendering, event wiring |
| `style.css` | 302 | Presentation (CSS custom properties for theme) |
| `index.html` | 46 | Static DOM scaffold |
| `CLAUDE.md` | 35 | Project memory (architecture, conventions, gotchas) |
| `README.md` | 2 | One-line repo description |
| **Total code (js+html+css)** | **657** | — |

Complexity proxy: `app.js` contains 25 decision-point keywords
(`if`/`for`/`while`/`case`/`catch`/`switch`/`&&`/`||`) across 309 lines.
`render()` (`app.js:136-285`, ~150 lines) is the single highest-complexity
function — it is also the one god function in the codebase (see Technical
Debt #3).

### Technology fingerprint

- **Language:** vanilla JavaScript (ES2021+: `crypto.randomUUID`,
  optional chaining not used), no framework
- **Build system:** none — no `package.json`, no bundler, no transpile step
- **Data store:** browser `localStorage` only, single key `todo-app.items`
- **Integration points:** none — no network calls, no APIs, no backend
- **Tests:** none
- **Dependencies:** none (confirmed — no manifest, no CDN `<script src>` tags)

## Architecture-at-a-Glance

The app is a strict three-file layering (markup → script → style) with no
modules — `app.js` is one flat script, so "domains" below are functional
groupings within it, connected via shared module-level state
(`todos`, `currentFilter`, `editingId`, `draggedId`) rather than imports.
Diagram: [`ARCHITECTURE.mmd`](./ARCHITECTURE.mmd).

| Domain | Files / functions | Responsibility | Depends on |
|---|---|---|---|
| UI Markup | `index.html:9-45` | Static scaffold; JS renders all `<li>` content at runtime | loads `app.js`, links `style.css` |
| Persistence | `STORAGE_KEY`, `loadTodos()` `app.js:19-34`, `saveTodos()` `app.js:36-38` | Read/write `todos` to `localStorage`; back-fills legacy records missing `priority`/`dueDate` | Browser `localStorage`, `JSON` |
| State / mutation | `todos`/`currentFilter`/`editingId`/`draggedId` (`app.js:5-8`), mutators `app.js:40-134` | Single source of truth; every mutator follows "mutate → `saveTodos()` → `render()`" | Persistence, calls into Rendering |
| Rendering | `render()` `app.js:136-285` | Rebuilds `#todo-list` from state; wires ~9 listeners per row | Reads module state; writes DOM; calls back into mutators |
| Event wiring / entry point | `app.js:287-309` | Binds cached DOM elements to mutators; bootstraps app | State/mutation, Rendering |
| Styling | `style.css` | Presentation only, keyed to class names `render()` assigns | Consumes Rendering's class-name contract |

No dangling references were found in either direction (every DOM id, CSS
class, and JS function referenced elsewhere is both defined and used).

## Production Runtime Profile

No telemetry available — this is a local, client-only static app with no
server, no logs, and no APM integration. Step skipped.

## Technical Debt

Ranked by remediation value (full detail from the subagent's trace):

1. **Inline-edit input is never focused** (`app.js:213-216`, `232-236`) —
   the new edit feature builds an `<input>` but never calls `.focus()` on
   it, so a user must click twice to actually type. One-line fix, high
   user-facing impact.
2. **`saveTodos()` has no error handling**, unlike `loadTodos()` which
   wraps `JSON.parse` in try/catch (`app.js:19-34` vs. `36-38`). A thrown
   `QuotaExceededError` leaves in-memory state ahead of persisted state
   with no warning — a refresh silently reverts the user's last action.
3. **`render()` is a ~150-line god function** (`app.js:136-285`) mixing
   teardown, empty-state, per-row construction, drag-and-drop wiring,
   field bindings, and the footer count. No unit boundary exists to test
   any one concern in isolation. Highest-leverage refactor — splitting it
   makes #1, #4, #5 below cheap side effects.
4. **Every row's ~9 listeners are re-created on every `render()`**
   (`app.js:158-264`), which fires after *every* state mutation. Not a
   leak (old nodes are discarded via `innerHTML=""`), but wasted work that
   won't scale gracefully as the list grows.
5. **Full list teardown/rebuild on any single-row change** destroys
   unrelated rows' interactive state — toggling one checkbox tears down
   every `<li>`, including any other row's open date picker or in-progress
   edit. Root cause of #1 and a likely source of future "my other edit
   disappeared" reports.
6. **Silent data loss on corrupt `localStorage`** (`app.js:31-33`,
   bare `catch { return []; }`) — already flagged as a known Gotcha in
   `CLAUDE.md:33`, confirming it's accepted but unaddressed risk.
7. **Copy-paste duplication in due-badge rendering** (`app.js:267-277`) —
   two near-identical blocks differing only in class/text; trivial to
   extract into `createBadge(className, text)`.
8. **Drag-and-drop listener wiring duplicated per-row** (`app.js:158-175`)
   with no shared helper; any future DnD change touches inline code inside
   the already-overloaded `render()`.
9. **Global, untyped, directly-mutated module state** (`app.js:5-8`) — four
   globals mutated from a dozen+ call sites with no single update path;
   works today by convention, not by structural guarantee.
10. **Implicit string coupling** between `index.html`'s `data-filter`
    attributes and the `switch` in `getFilteredTodos()` (already a
    documented Gotcha in `CLAUDE.md:35`), plus a dead `dataset.id`
    attribute set on every row but never read back.

No hardcoded credentials, dead files, or deprecated Web APIs were found.

## Security Findings

No external dependencies, no manifests, no secrets. All DOM writes use
`textContent`/`createElement`/property assignment — the only `innerHTML`
use (`app.js:138`) sets an empty string, so there is no DOM-XSS sink.

| ID | CWE | Severity | Location | Issue |
|---|---|---|---|---|
| SEC-001 | CWE-502 / CWE-1284 | Low | `app.js:19-34`, `212`, `259` | `loadTodos()` trusts parsed JSON shape with no type/enum/length validation — a tampered `localStorage` entry (e.g. via a rogue same-origin script or manual devtools edit) could set an arbitrary `priority` CSS class or an unbounded `text` length. |
| SEC-002 | CWE-406 / CWE-770 | Low | `app.js:287-296`, `index.html:14-20` | No `maxlength` on the todo-text input and no length cap in `addTodo`/`editTodoText`; a very large `text`, repeated, can approach the per-origin storage quota and cause `saveTodos()` to throw uncaught. |
| SEC-003 | CWE-354 | Info | `app.js:42` | `crypto.randomUUID()` requires a secure context; harmless today (`file://` only, per `CLAUDE.md`) but a landmine if this is ever hosted over plain HTTP. Already documented as a Gotcha. |
| SEC-004 | CWE-1021 | Info | `index.html` | No CSP / frame-ancestors meta tag. Not exploitable as a local file today; worth adding before any web hosting. |

No hardcoded secrets were found, so no `SECRETS.local.md` was created.

## Documentation Gaps

Behaviors a new engineer would need explained that `CLAUDE.md` does not
currently cover (it already documents the architecture, localStorage key,
`render()` convention, and 3 of the gotchas found above):

1. The inline-edit input isn't auto-focused — a known-but-undocumented UX
   papercut (Technical Debt #1).
2. `render()`'s full teardown/rebuild wipes any other row's in-progress
   interactive state on any single-row change (Technical Debt #5) — not
   mentioned anywhere.
3. `saveTodos()` has no error handling and can throw on quota exhaustion,
   asymmetric with `loadTodos()`'s guarded parse (Technical Debt #2).
4. `li.dataset.id` is set on every row but never read back anywhere in the
   codebase — dead attribute, easy to assume it's load-bearing.
5. No length validation exists on todo text — unbounded growth is
   possible via the UI with no client-side guard.

## Relative Scale

Fallback formula used (no `scc`/`cloc` installed):
**COCOMO-II basic, nominal scale factors:** `2.94 × (KSLOC)^1.10`

- Code SLOC (js+html+css, docs excluded): 657 lines → 0.657 KSLOC
- `2.94 × (0.657)^1.10 ≈ 1.85`

**This is a relative size/complexity index only** — a way to rank this
system against others in a portfolio, not a timeline or cost estimate. It
assumes traditional human-team productivity curves, which agentic
transformation does not follow. No person-months, schedule, or dollar
figure is implied by this number; at this scale (well under 1 KSLOC) the
index itself confirms this is a toy-sized codebase, not a modernization
program.

## Recommended Modernization Pattern

**Refactor** (in-place, same stack) — one-paragraph rationale: the stack
itself (vanilla HTML/CSS/JS, no dependencies) is appropriate for this
app's scope and needs no version bump or cross-stack rewrite; the actual
findings are all code-quality issues inside a single file (`app.js`'s
`render()` god-function, missing error handling, one focus bug). This
maps to the **Replatform / Refactor-in-place** track, which routes to
`/modernize-uplift` — though note that command's primary use case
(framework/runtime version uplifts) is a looser fit here than for a
typical estate, since there is no dependency or version to bump. Given
the codebase's small size (657 lines), a direct manual refactor of the
Technical Debt items above (split `render()`, add `saveTodos()` error
handling, fix the focus bug) is likely more practical than invoking the
full uplift workflow.
