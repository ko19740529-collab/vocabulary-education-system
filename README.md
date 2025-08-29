# 英単語テストシステム v2.0 Premium

## プロジェクト概要
- **名前**: vocabulary-test-system-v2-premium
- **バージョン**: 2.1.0
- **目標**: 教育用英単語テスト作成システム（プレミアムPDF生成機能付き）
- **主要機能**: 
  - 英単語テストの自動生成（選択問題・穴埋め問題・マッチング問題）
  - 難易度別・カテゴリ別テスト作成
  - インタラクティブなテスト実行
  - 詳細な結果分析
  - プレミアムPDF生成機能

## 公開URL
- **開発サーバー**: https://3000-i5jfhg3kwdlm6ta9f4c73-6532622b.e2b.dev
- **GitHub**: （未設定 - 必要に応じてGitHub連携可能）

## API エンドポイント

### 現在実装済みの機能
| エンドポイント | メソッド | 説明 | パラメータ |
|---------------|---------|------|-----------|
| `/` | GET | メインページ表示 | なし |
| `/api/vocabulary` | GET | 全単語データ取得 | なし |
| `/api/categories` | GET | カテゴリ一覧取得 | なし |
| `/api/generate-test` | POST | テスト生成 | `{difficulty, format, category, count}` |
| `/api/generate-pdf` | POST | PDF生成（プレミアム） | `{test, options}` |
| `/api/download-pdf/:testId` | GET | PDF ダウンロード | `testId` |

### テスト設定パラメータ
- **difficulty**: `easy` \| `medium` \| `hard` \| `mixed`
- **format**: `multiple-choice` \| `fill-blank` \| `matching`
- **category**: 任意のカテゴリ名（空文字で全カテゴリ）
- **count**: 問題数（1-50）

## データアーキテクチャ
- **データモデル**: VocabularyWord（id, word, meaning, difficulty, category）
- **ストレージサービス**: メモリ内データベース（20語のサンプルデータ）
- **将来の拡張**: Cloudflare D1 SQLite データベース連携対応
- **データフロー**: API → フロントエンド → テスト生成 → 結果表示

## 利用方法
1. **テスト設定**: 難易度・形式・カテゴリ・問題数を選択
2. **テスト生成**: 「テスト生成」ボタンでテスト作成
3. **テスト実行**: 「テスト開始」で問題を順次回答
4. **結果確認**: 点数・正解率・詳細解答を表示
5. **PDF出力**: プレミアム機能でPDF生成・印刷

## 開発・デプロイメント

### 開発環境
```bash
# 依存関係インストール
npm install

# 開発用ビルド
npm run build

# 開発サーバー起動
pm2 start ecosystem.config.cjs

# テスト
npm run test
```

### プロダクション環境
```bash
# Cloudflare Pages デプロイ
npm run deploy

# ポートクリーンアップ
npm run clean-port
```

## 技術スタック
- **バックエンド**: Hono + TypeScript
- **フロントエンド**: Vanilla JavaScript + TailwindCSS
- **デプロイ**: Cloudflare Pages / Workers
- **開発環境**: Vite + Wrangler
- **プロセス管理**: PM2

## 未実装機能
- [ ] Cloudflare D1 データベース連携
- [ ] ユーザー管理・認証システム
- [ ] 実際のPDF生成API連携
- [ ] テスト履歴保存機能
- [ ] カスタム単語帳作成
- [ ] 音声読み上げ機能

## 推奨次ステップ
1. **データベース拡張**: Cloudflare D1でデータ永続化
2. **認証機能**: ユーザー登録・ログイン機能追加
3. **PDF生成**: 外部PDF生成API（jsPDF等）の連携
4. **UI/UX改善**: より直感的なインターフェース設計
5. **多言語対応**: 英語以外の言語テスト対応

## 最終更新
- **最終更新日**: 2024-08-29
- **デプロイ状況**: ✅ アクティブ（開発環境）
- **バージョン**: 2.1.0
