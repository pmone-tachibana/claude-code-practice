# memo2

2026-08-28

- この環境にはNode.jsが未インストールだったため、`brew install node` で導入が必要だった
- `/code-review high` で `reorderTodo()` のoff-by-oneバグなど10件の指摘（うち8件CONFIRMED）が見つかった
- `render()` の再入（編集中に別行を操作すると`blur`が誘発する再帰的な再描画）がDOM二重化を引き起こす、最も重大な問題
