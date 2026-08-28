#!/usr/bin/env python3
"""
Topology extractor for claude-code-practice.

Note: this project has no `legacy/<system>` structure (it is not a legacy
estate under modernization) — by user direction (see ASSESSMENT.md), this
script targets the repository root directly and treats it as one small
"system" named claude-code-practice.

The app is a single flat app.js (no modules, no dispatcher tables, no data
store other than localStorage), so the extraction is much simpler than a
mainframe/enterprise estate: function definitions + call edges + one
localStorage-backed datastore + a synthetic "bootstrap" node for top-level
script execution and DOM event wiring (the app's real entry point, since
JS has no explicit main()).

Direct calls vs. dispatch calls: a "dispatch" edge is any call that happens
inside an addEventListener(...) callback — i.e. it doesn't run when the
enclosing function executes, only later, in response to a DOM event. This
mirrors the call/dispatch distinction the command asks for, resolved
lexically (paren-depth tracking) rather than via a config/route table,
since this codebase has none.
"""
import json
import os
import re

ROOT = "/Users/kuni/Projects/www/claude-code-practice"
APP_JS = os.path.join(ROOT, "app.js")
INDEX_HTML = os.path.join(ROOT, "index.html")
STYLE_CSS = os.path.join(ROOT, "style.css")
OUT_DIR = os.path.join(ROOT, "analysis", "claude-code-practice")

with open(APP_JS, encoding="utf-8") as f:
    src = f.read()
lines = src.splitlines()

FUNC_DEF_RE = re.compile(r"^function\s+(\w+)\s*\(")


def find_matching_brace_end(start_idx):
    """Given the 0-based line index of a `function name(...) {` line, return
    the 0-based line index of the matching closing brace."""
    depth = 0
    started = False
    for j in range(start_idx, len(lines)):
        depth += lines[j].count("{") - lines[j].count("}")
        if "{" in lines[j]:
            started = True
        if started and depth == 0:
            return j
    return len(lines) - 1


functions = {}  # name -> {start(1-based), end(1-based), loc, body}
covered = set()  # 0-based line indices covered by a function body

for i, line in enumerate(lines):
    m = FUNC_DEF_RE.match(line)
    if m:
        name = m.group(1)
        end = find_matching_brace_end(i)
        body = "\n".join(lines[i:end + 1])
        functions[name] = {"start": i + 1, "end": end + 1, "loc": end - i + 1, "body": body}
        covered.update(range(i, end + 1))

# Top-level ("bootstrap") code: every line not inside a function body.
bootstrap_lines = [lines[i] for i in range(len(lines)) if i not in covered]
bootstrap_body = "\n".join(bootstrap_lines)
bootstrap_loc = len([l for l in bootstrap_lines if l.strip()])

FUNC_NAMES = set(functions.keys())


def dispatch_zones(body):
    """Return a list of (start_char, end_char) spans covering the argument
    list of every `<expr>.addEventListener(...)` call in `body`, using
    paren-depth counting from the opening paren."""
    zones = []
    for m in re.finditer(r"\.addEventListener\s*\(", body):
        open_idx = m.end() - 1  # index of the '('
        depth = 0
        for k in range(open_idx, len(body)):
            if body[k] == "(":
                depth += 1
            elif body[k] == ")":
                depth -= 1
                if depth == 0:
                    zones.append((open_idx, k))
                    break
    return zones


def in_zone(pos, zones):
    return any(s <= pos <= e for s, e in zones)


def extract_call_edges(source_id, body):
    """Find calls (and bare function-reference args, e.g. `btn.addEventListener("click", clearCompleted)`)
    to any known function name inside `body`. Classify as dispatch if inside
    an addEventListener(...) argument list, else call. Self-loops are dropped."""
    edges = []
    zones = dispatch_zones(body)
    for name in FUNC_NAMES:
        if name == source_id:
            continue
        for m in re.finditer(rf"\b{re.escape(name)}\b\s*\(?", body):
            pos = m.start()
            # skip the function's own definition line ("function name(")
            if body[max(0, pos - 9):pos].strip().endswith("function"):
                continue
            kind = "dispatch" if in_zone(pos, zones) else "call"
            edges.append((source_id, name, kind))
    return edges


all_edges = set()
for fname, info in functions.items():
    for e in extract_call_edges(fname, info["body"]):
        all_edges.add(e)
for e in extract_call_edges("mod:bootstrap", bootstrap_body):
    all_edges.add(e)

# localStorage read/write -> datastore edges
DS_ID = "ds:todo-app-items"
storage_edges = set()
for fname in ("loadTodos", "saveTodos"):
    body = functions[fname]["body"]
    if re.search(r"localStorage\.getItem", body):
        storage_edges.add((fname, DS_ID, "read"))
    if re.search(r"localStorage\.setItem", body):
        storage_edges.add((fname, DS_ID, "write"))

DOMAIN_MAP = {
    "dom:persistence": ["loadTodos", "saveTodos"],
    "dom:state": [
        "addTodo", "toggleTodo", "deleteTodo", "clearCompleted", "editTodoText",
        "updatePriority", "updateDueDate", "reorderTodo", "getFilteredTodos",
        "getTodayISO", "getDueStatus",
    ],
    "dom:rendering": ["render"],
}
DOMAIN_LABELS = {
    "dom:persistence": "Persistence",
    "dom:state": "State & mutation",
    "dom:rendering": "Rendering",
    "dom:entry": "Entry point / event wiring",
    "dom:ui": "UI markup",
    "dom:styling": "Styling",
    "dom:data": "Data stores",
}

html_loc = sum(1 for _ in open(INDEX_HTML, encoding="utf-8"))
css_loc = sum(1 for _ in open(STYLE_CSS, encoding="utf-8"))

children = []
for dom_id in ("dom:ui", "dom:entry", "dom:rendering", "dom:state", "dom:persistence", "dom:styling"):
    if dom_id == "dom:ui":
        mods = [{"id": "index.html", "name": "index.html", "kind": "module", "language": "html", "loc": html_loc, "file": "index.html"}]
    elif dom_id == "dom:styling":
        mods = [{"id": "style.css", "name": "style.css", "kind": "module", "language": "css", "loc": css_loc, "file": "style.css"}]
    elif dom_id == "dom:entry":
        mods = [{"id": "mod:bootstrap", "name": "bootstrap (top-level + event wiring)", "kind": "module", "language": "javascript", "loc": bootstrap_loc, "file": "app.js"}]
    else:
        mods = [
            {"id": n, "name": n, "kind": "module", "language": "javascript",
             "loc": functions[n]["loc"], "file": f"app.js:{functions[n]['start']}-{functions[n]['end']}"}
            for n in DOMAIN_MAP[dom_id]
        ]
    children.append({"id": dom_id, "name": DOMAIN_LABELS[dom_id], "kind": "domain", "children": mods})

children.append({
    "id": "dom:data", "name": DOMAIN_LABELS["dom:data"], "kind": "domain",
    "children": [{"id": DS_ID, "name": "todo-app.items (localStorage)", "kind": "datastore"}],
})

edges = []
for s, t, k in sorted(all_edges | storage_edges):
    edges.append({"source": s, "target": t, "kind": k})
# index.html -> bootstrap (script load), index.html -> style.css (stylesheet link)
edges.append({"source": "index.html", "target": "mod:bootstrap", "kind": "call"})
edges.append({"source": "index.html", "target": "style.css", "kind": "call"})

all_leaf_ids = {"mod:bootstrap", "index.html", "style.css", DS_ID} | FUNC_NAMES
inbound = {t for _, t, _ in all_edges} | {t for _, t, _ in storage_edges} | {"mod:bootstrap", "style.css"}
dead_ends = sorted(all_leaf_ids - inbound - {"index.html"})  # index.html is the entry point itself

topology = {
    "system": "claude-code-practice",
    "root": {"id": "sys", "name": "claude-code-practice", "kind": "system", "children": children},
    "edges": edges,
    "entryPoints": ["index.html"],
    "deadEnds": dead_ends,
    "observations": [
        "Single flat app.js with no modules — every 'domain' below is a functional grouping inside one file, not a separate deployable unit.",
        "render() is the busiest node: it holds direct 'call' edges to the derived-state helpers (getFilteredTodos, getDueStatus, getTodayISO) and 'dispatch' edges to every mutator (toggleTodo, deleteTodo, editTodoText, updatePriority, updateDueDate, reorderTodo) via addEventListener closures rebuilt on every render — see Technical Debt #3-#5 in ASSESSMENT.md.",
        "All state-changing functions funnel through the same two-step tail (saveTodos() -> localStorage write -> render()), so todo-app.items is a single-writer-many-callers datastore with no contention risk in this single-tab, single-user app.",
        "mod:bootstrap (top-level script body + top-level addEventListener wiring) is the de facto entry point after index.html loads app.js; there is no other way into the program.",
        f"No true dead ends after resolving both direct calls and addEventListener dispatch targets ({len(dead_ends)} found) — confirms the prior /modernize-assess finding of no dangling references.",
        "getTodayISO/getDueStatus are the only pure helper functions with no outbound edges to storage or DOM — natural first candidates if unit tests are ever added.",
    ],
    "flows": [
        {
            "name": "タスクを追加する",
            "persona": "アプリ利用者",
            "description": "利用者がテキスト・優先度・期限日を入力してタスクを一覧に追加する。",
            "steps": [
                {"label": "フォームに入力して送信", "nodes": ["index.html", "mod:bootstrap"]},
                {"label": "新しいタスクを配列に追加", "nodes": ["mod:bootstrap", "addTodo"]},
                {"label": "localStorageに保存", "nodes": ["addTodo", "saveTodos", DS_ID]},
                {"label": "一覧を再描画", "nodes": ["addTodo", "render"]},
            ],
        },
        {
            "name": "タスクを完了・削除する",
            "persona": "アプリ利用者",
            "description": "利用者がチェックボックスや削除ボタンで既存タスクを片付ける。",
            "steps": [
                {"label": "チェックボックス/削除ボタンをクリック", "nodes": ["render", "toggleTodo"]},
                {"label": "状態を更新して保存", "nodes": ["toggleTodo", "saveTodos", DS_ID]},
                {"label": "一覧を再描画（完了/削除を反映）", "nodes": ["toggleTodo", "render"]},
            ],
        },
        {
            "name": "タスクをドラッグ&ドロップで並び替える",
            "persona": "アプリ利用者",
            "description": "利用者がタスクをドラッグして表示順を変更する。",
            "steps": [
                {"label": "ドラッグ開始〜ドロップ", "nodes": ["render", "reorderTodo"]},
                {"label": "配列の順序を入れ替えて保存", "nodes": ["reorderTodo", "saveTodos", DS_ID]},
                {"label": "新しい順序で再描画", "nodes": ["reorderTodo", "render"]},
            ],
        },
        {
            "name": "タスクをその場で編集する",
            "persona": "アプリ利用者",
            "description": "利用者がタスクのテキストをダブルクリック（または✎ボタン）で直接編集する。",
            "steps": [
                {"label": "ダブルクリック/編集ボタンで編集モードへ", "nodes": ["render"]},
                {"label": "Enter/blurで保存を確定", "nodes": ["render", "editTodoText"]},
                {"label": "保存して再描画", "nodes": ["editTodoText", "saveTodos", DS_ID, "render"]},
            ],
        },
    ],
}

os.makedirs(OUT_DIR, exist_ok=True)
with open(os.path.join(OUT_DIR, "topology.json"), "w", encoding="utf-8") as f:
    json.dump(topology, f, ensure_ascii=False, indent=2)

print(f"functions found: {len(functions)}")
for n in sorted(functions):
    print(f"  {n}: lines {functions[n]['start']}-{functions[n]['end']} ({functions[n]['loc']} loc)")
print(f"bootstrap (top-level) loc: {bootstrap_loc}")
print(f"edges: {len(edges)}")
for e in edges:
    print(f"  {e['source']} --{e['kind']}--> {e['target']}")
print(f"entry points: {topology['entryPoints']}")
print(f"dead ends: {dead_ends}")
