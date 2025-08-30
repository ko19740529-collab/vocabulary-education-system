# 🚀 Cloudflare Pages 手動デプロイガイド

## 📋 準備完了ファイル

### 🎯 デプロイ対象ファイル (dist/ ディレクトリ)
```
📁 vocabulary-education-system/
├── _worker.js (57KB) - メインアプリケーション
├── _routes.json (54B) - ルーティング設定
└── static/
    ├── app.js (17KB) - フロントエンド JavaScript
    ├── style.css (3.8KB) - メインスタイル
    └── styles.css (3.8KB) - 追加スタイル
```

---

## 🌐 Cloudflare Pages 手動デプロイ手順

### ステップ1: Cloudflare Dashboard にアクセス
```
URL: https://dash.cloudflare.com
ログイン: eisai.hachi.10@gmail.com
```

### ステップ2: Pages セクションに移動
```
左サイドバー → "Workers and Pages"
または
直接URL: https://dash.cloudflare.com/[account-id]/pages
```

### ステップ3: 新規プロジェクト作成
```
1. "Create application" ボタンをクリック
2. "Pages" タブを選択
3. "Upload assets" を選択
```

### ステップ4: プロジェクト設定
```
Project name: vocabulary-education-system
Description: 教育用単語管理システム - リアルタイム30名対応
```

### ステップ5: ファイルアップロード

#### 📁 アップロード方法A: ドラッグ&ドロップ
```
1. dist/ 内の全ファイルを選択
2. アップロード画面にドラッグ
3. アップロード完了を待機
```

#### 📁 アップロード方法B: ファイル選択
```
1. "Select files" をクリック
2. dist/ 内の全ファイルを選択:
   ✅ _worker.js
   ✅ _routes.json  
   ✅ static/app.js
   ✅ static/style.css
   ✅ static/styles.css
3. "Upload" をクリック
```

### ステップ6: デプロイ実行
```
1. "Create Pages project" をクリック
2. デプロイ処理待機 (通常1-3分)
3. 成功メッセージの確認
```

---

## 🎉 デプロイ完了後の情報

### 🌐 取得される永続URL
```
Production: https://vocabulary-education-system.pages.dev
Preview: https://main.vocabulary-education-system.pages.dev
```

### 📊 確認事項
```
✅ メインページアクセス確認
✅ API動作確認: /api/statistics
✅ 単語追加・削除機能テスト
✅ リアルタイム同期確認
```

---

## 🔧 トラブルシューティング

### エラー1: アップロードファイル制限
**症状**: ファイルサイズエラー
**解決**: _worker.js が57KB で制限内のため正常

### エラー2: プロジェクト名重複
**症状**: "Project name already exists"  
**解決**: 
- vocabulary-education-system-v2
- vocab-system-edu
- educational-vocabulary-manager

### エラー3: ルーティング問題
**症状**: 404 Not Found
**解決**: _routes.json の確認・再アップロード

---

## 📞 サポート

### 成功確認方法
```bash
# 新しいURLでのテスト
curl https://vocabulary-education-system.pages.dev/api/statistics

# 期待される結果
{"success":true,"statistics":{"totalWords":3,"lastUpdated":"..."}}
```

### 30名への新URL案内
```
🎓 永続URL更新のお知らせ

新しいアクセスURL:
https://vocabulary-education-system.pages.dev

特徴:
✅ 永続的にアクセス可能
✅ 高速・安定動作  
✅ 同じ機能・データ
✅ ブックマーク推奨

旧URL（一時的）:
https://3000-i5jfhg3kwdlm6ta9f4c73-6532622b.e2b.dev
→ 新URLに順次移行してください
```

---

**📅 作成日時**: 2025年8月30日  
**🔄 最終更新**: デプロイ実行時に自動更新  
**📊 ステータス**: 手動デプロイ準備完了