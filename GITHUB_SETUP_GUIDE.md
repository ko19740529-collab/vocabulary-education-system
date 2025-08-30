# 🚀 GitHub連携 - 詳細セットアップガイド

## 📋 現在の準備状況

### ✅ 完了済み項目
- Git リポジトリ初期化
- コミット履歴 (完全な開発履歴)
- .gitignore 設定
- プロジェクトファイル準備

### ⏳ 実行待ち項目
- GitHub リモートリポジトリ作成
- コードプッシュ
- Cloudflare Pages GitHub連携

---

## 🔧 ステップ1: GitHubリポジトリ作成

### 方法A: GitHub Web UI 経由 (推奨)

#### 1. GitHub.com にアクセス
```
URL: https://github.com/new
または
GitHub.com → 右上「+」→ "New repository"
```

#### 2. リポジトリ設定
```
Repository name: vocabulary-education-system
Description: 教育用単語管理システム - リアルタイム30名対応版
Visibility: 
  ○ Public (推奨 - Cloudflare連携しやすい)
  ○ Private (必要に応じて)

初期化オプション:
☐ Add a README file (チェックしない - 既存コードがあるため)
☐ Add .gitignore (チェックしない - 既に設定済み)  
☐ Choose a license (オプション)
```

#### 3. リポジトリ作成実行
```
"Create repository" ボタンをクリック
```

---

## 📤 ステップ2: コードのプッシュ

### リポジトリ作成後に表示される手順

```bash
# 表示される例 (your-username は実際のユーザー名)
git remote add origin https://github.com/your-username/vocabulary-education-system.git
git branch -M main
git push -u origin main
```

### サンドボックス環境での実行手順

```bash
# リモートリポジトリの追加
cd /home/user/webapp
git remote add origin https://github.com/[YOUR-USERNAME]/vocabulary-education-system.git

# ブランチ名を main に統一 (既に main の場合はスキップ)
git branch -M main

# 初回プッシュ (認証が必要)
git push -u origin main
```

---

## 🔐 ステップ3: 認証設定

### GitHub認証の方法

#### 方法1: Personal Access Token (推奨)
```
1. GitHub Settings → Developer settings → Personal access tokens
2. "Generate new token (classic)" をクリック  
3. 権限設定:
   ✅ repo (Full control of private repositories)
   ✅ workflow (Update GitHub Action workflows)
4. トークンをコピー
5. git push 時にパスワードとして使用
```

#### 方法2: GitHub CLI 認証
```bash
# GitHub CLI がある場合
gh auth login
```

#### 方法3: SSH キー設定
```bash
# SSH キーの生成と設定 (上級者向け)
ssh-keygen -t ed25519 -C "genspark_dev@genspark.ai"
```

---

## 🌐 ステップ4: Cloudflare Pages GitHub連携

### GitHubリポジトリ作成・プッシュ完了後

#### 1. Cloudflare Dashboard にアクセス
```
URL: https://dash.cloudflare.com
左サイドバー → "Workers and Pages"
```

#### 2. Pages プロジェクト作成
```
"Create application" → "Pages" → "Connect to Git"
```

#### 3. GitHub リポジトリ選択
```
GitHub アカウント認証 (必要に応じて)
リポジトリ選択: vocabulary-education-system
ブランチ選択: main
```

#### 4. ビルド設定
```
Framework preset: None (カスタム設定)
Build command: npm run build
Build output directory: dist
Root directory: / (デフォルト)
```

#### 5. 環境変数設定 (必要に応じて)
```
NODE_ENV: production
```

#### 6. デプロイ実行
```
"Save and Deploy" をクリック
デプロイ完了まで待機 (2-5分)
```

---

## 🎉 完了後の確認事項

### 取得される URL
```
Production: https://vocabulary-education-system.pages.dev
GitHub: https://github.com/[username]/vocabulary-education-system
```

### 動作確認
```bash
# 新しい永続URLのテスト
curl https://vocabulary-education-system.pages.dev/api/statistics

# 期待される結果
{"success":true,"statistics":{"totalWords":3,"lastUpdated":"..."}}
```

### 30名への案内
```
🎓 永続URL開始のお知らせ

新しいメインURL:
https://vocabulary-education-system.pages.dev

特徴:
✅ 永続的にアクセス可能
✅ 自動更新 (システム改善時)  
✅ 高速・安定動作
✅ 同じ機能・データ

移行のお願い:
旧URL → 新URL にブックマーク更新
```

---

## 🔧 トラブルシューティング

### エラー1: git push 認証失敗
**解決**: Personal Access Token を作成・使用

### エラー2: リポジトリ名重複
**解決**: vocabulary-education-system-v2 等に変更

### エラー3: Cloudflare 連携失敗  
**解決**: リポジトリをPublicに設定

### エラー4: ビルドエラー
**解決**: Build command を "npm run build" に設定

---

**📅 作成日時**: 2025年8月30日  
**🎯 目標**: GitHub → Cloudflare Pages 自動デプロイ完成  
**📊 ステータス**: 手順準備完了