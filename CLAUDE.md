# CLAUDE.md

## プロジェクト概要
Claude Code の練習用リポジトリ。ビルド不要なバニラ HTML/CSS/JS 製の TODO リストアプリ。

## 実行方法
`index.html` をブラウザで直接開くだけで動作する。ローカルサーバーやビルドコマンドは不要。

```bash
open index.html  # macOS
```

## ファイル構成
- `index.html` — UI構造（日本語）
- `app.js` — ロジック（状態管理、localStorage永続化、追加/削除/完了切り替え/フィルタ）
- `style.css` — スタイル（CSS変数でテーマカラーを管理）
- `README.md` — リポジトリ概要

## アーキテクチャ
- `app.js` がグローバルな `todos` 配列で状態を保持し、`localStorage`（キー: `todo-app.items`）に永続化する
- DOM操作は素の `document` API を使用。フレームワークは不使用
- `render()` が唯一の描画関数。状態を変更する操作（追加/削除/完了切り替え/フィルタ変更など）は必ず最後に `render()` を呼ぶパターンになっている

## コーディング規約
- UIに表示する文言は日本語
- インデントは2スペース
- 関数名・変数名はキャメルケース

## 既知の制約
- テストフレームワーク・リンター・ビルドツールは未導入

## Gotchas
- `loadTodos()` は `localStorage` の中身が壊れている（JSON.parseに失敗する）場合、エラーを握りつぶして空配列を返す（サイレントにデータが消えたように見える）
- ID生成に `crypto.randomUUID()` を使用しており、セキュアコンテキストが必要（`file://` やlocalhostでは動作するが、非localhostのプレーンHTTP配信では動かない）
- フィルタボタンの `data-filter` 属性値（`all`/`active`/`completed`）と `getFilteredTodos()` の `switch` 文が文字列で暗黙に対応している。新しいフィルタを追加する際は両方を同期させる必要がある
