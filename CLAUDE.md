# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要
Claude Code の練習用リポジトリ。ビルド不要なバニラ HTML/CSS/JS 製の TODO リストアプリ（`index.html`/`app.js`/`style.css`）。優先度・期限日・インライン編集・ドラッグ&ドロップ並び替えに対応。

## コマンド

アプリ本体はビルド不要。
```bash
open index.html  # macOS。サーバー・ビルドコマンド不要
```

`scripts/crawl.mjs`（Playwrightで各UI状態を巡回してスクリーンショットを撮る開発用スモークチェック。単体テストではない）を動かす場合のみ Node.js が必要:
```bash
npm install
npx playwright install chromium   # 初回のみ
npm run crawl                     # scripts/screenshots/ にPNGを保存
```

自動テスト・リンターは未導入（下記「既知の制約」参照）。

## ファイル構成
- `index.html` — UI構造（日本語）
- `app.js` — ロジック（状態管理、localStorage永続化、優先度/期限日/編集/並び替え）
- `style.css` — スタイル（CSS変数でテーマカラーを管理）
- `scripts/crawl.mjs` — Playwright製の画面巡回スクリプト（開発用、`package.json`の`devDependencies`が必要）
- `analysis/claude-code-practice/` — `/modernize-assess`・`/modernize-map`で生成した分析ドキュメント（アセスメント、トポロジーマップ）。コード本体とは無関係の生成物
- `README.md` — リポジトリ概要

## アーキテクチャ
- `app.js` がグローバルな `todos` 配列で状態を保持し、`localStorage`（キー: `todo-app.items`）に永続化する
- DOM操作は素の `document` API を使用。フレームワークは不使用
- `render()` が唯一の描画関数。状態を変更する操作（追加/削除/完了切り替え/編集/優先度・期限日変更/並び替え/フィルタ変更など）は必ず最後に `render()` を呼ぶパターンになっている
- `render()` は毎回 `list.innerHTML = ""` で全`<li>`を作り直し、行ごとのイベントリスナー（チェックボックス/編集/削除/優先度/期限日/ドラッグ&ドロップ）もすべて再登録する

## コーディング規約
- UIに表示する文言は日本語
- インデントは2スペース
- 関数名・変数名はキャメルケース

## 既知の制約
- テストフレームワーク・リンター・ビルドツールは未導入（`scripts/crawl.mjs`はスモークチェックであり、アサーションを伴う自動テストではない）

## Gotchas
- `loadTodos()` は `localStorage` の中身が壊れている（JSON.parseに失敗する、または要素の一部が不正な形式）場合、エラーを握りつぶして**リスト全体**を空配列として返す（1件の破損で全データが消えたように見える）
- ID生成に `crypto.randomUUID()` を使用しており、セキュアコンテキストが必要（`file://` やlocalhostでは動作するが、非localhostのプレーンHTTP配信では動かない）
- フィルタボタンの `data-filter` 属性値（`all`/`active`/`completed`）と `getFilteredTodos()` の `switch` 文が文字列で暗黙に対応している。新しいフィルタを追加する際は両方を同期させる必要がある
- `getTodayISO()` が `toISOString()`（UTC基準）を使っており、JST基準の「今日」とは日付境界で最大9時間ずれる。期限切れ/本日締切の判定に影響する
- **`render()`の再入バグ**: いずれかの行が編集中（`editingId`セット済み）の間に別の行を操作すると、`list.innerHTML=""`が編集中の`<input>`を削除→`blur`が同期発火→`editTodoText()`がネストした`render()`を呼ぶ→外側の`render()`が古いスナップショットで続行し`<li>`が重複する。同じ機構で、編集中に別行のボタンをクリックすると再描画でDOMが差し替わりクリックが失われる/誤爆することがある
- `reorderTodo()` は後方向へのドラッグ（`fromIndex < toIndex`）で1つ先の位置にずれるoff-by-oneバグがある（`splice`で要素を除去した後のインデックスシフトを未調整）
- ドラッグ&ドロップの `dragstart` ハンドラが `dataTransfer.setData()` を呼んでいないため、Firefoxではドラッグ操作自体が開始されない（Chromium系のみ動作）
