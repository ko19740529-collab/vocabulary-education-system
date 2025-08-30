-- ============================================================================
-- 🌟 VOCABULARY EDUCATION SYSTEM - SHARED DATABASE SCHEMA
-- ============================================================================
-- 設計理念: 
-- - 30名同時利用対応
-- - 認証なし共有システム
-- - リアルタイム同期対応
-- - 教育機関向け分類体系
-- ============================================================================

-- 📚 共有単語マスターテーブル
CREATE TABLE shared_words (
    id TEXT PRIMARY KEY,
    japanese TEXT NOT NULL,
    english TEXT NOT NULL,
    phonetic TEXT,
    difficulty INTEGER DEFAULT 1,
    
    -- 🎯 教育機関向け分類
    school_type TEXT CHECK (school_type IN ('elementary', 'junior_high', 'senior_high', 'university', 'general')),
    grade_level TEXT,                    -- '1', '2', '3', '4', '5', '6'
    exam_type TEXT,                      -- 'entrance', 'eiken_5', 'eiken_4', 'eiken_3', 'eiken_pre2', 'eiken_2', 'eiken_pre1', 'eiken_1', 'toeic', 'toefl'
    subject_area TEXT,                   -- 'basic', 'science', 'literature', 'history', 'math', 'daily_life'
    
    -- 📊 使用統計
    usage_frequency INTEGER DEFAULT 0,
    last_used_at DATETIME,
    is_verified BOOLEAN DEFAULT FALSE,   -- 講師による確認済みフラグ
    
    -- 🔄 変更追跡（認証なし対応）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_from_ip TEXT,
    updated_from_ip TEXT,
    created_user_agent TEXT,
    updated_user_agent TEXT
);

-- 🔄 変更履歴テーブル（全操作記録）
CREATE TABLE change_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    
    -- 📊 変更内容詳細
    old_data TEXT,                       -- JSON形式の変更前データ
    new_data TEXT,                       -- JSON形式の変更後データ
    field_changes TEXT,                  -- JSON形式の変更フィールド詳細
    
    -- 🕒 タイムスタンプ
    change_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- 🔍 追跡情報（認証なしでの識別）
    source_ip TEXT,
    user_agent TEXT,
    session_id TEXT,
    device_fingerprint TEXT              -- ブラウザフィンガープリント
);

-- 📊 共有テスト・単語集管理
CREATE TABLE shared_test_sets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    
    -- 🎯 フィルタ条件（JSON形式）
    category_filters TEXT,               -- JSON: {"school_type": "junior_high", "grade_level": ["1", "2"], "exam_type": ["eiken_3"]}
    word_count INTEGER DEFAULT 0,
    
    -- ⏰ 期間管理
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,                 -- 期間限定単語集用
    
    -- 📈 使用統計
    download_count INTEGER DEFAULT 0,
    last_downloaded_at DATETIME,
    
    -- 🔍 作成者追跡
    created_from_ip TEXT,
    created_user_agent TEXT,
    session_id TEXT
);

-- 🔗 テスト単語関連テーブル
CREATE TABLE test_set_words (
    test_set_id TEXT NOT NULL,
    word_id TEXT NOT NULL,
    order_num INTEGER NOT NULL,
    
    -- 📊 個別設定
    is_priority BOOLEAN DEFAULT FALSE,   -- 重要単語フラグ
    custom_note TEXT,                    -- カスタムメモ
    
    PRIMARY KEY (test_set_id, word_id),
    FOREIGN KEY (test_set_id) REFERENCES shared_test_sets(id) ON DELETE CASCADE,
    FOREIGN KEY (word_id) REFERENCES shared_words(id) ON DELETE CASCADE
);

-- 📈 システム統計テーブル
CREATE TABLE system_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    
    -- 📊 日次統計
    total_words INTEGER DEFAULT 0,
    words_added_today INTEGER DEFAULT 0,
    tests_created_today INTEGER DEFAULT 0,
    active_sessions INTEGER DEFAULT 0,
    
    -- 🎯 カテゴリ別統計（JSON）
    category_stats TEXT,                 -- JSON形式の詳細統計
    
    -- ⚡ パフォーマンス統計
    avg_response_time INTEGER DEFAULT 0, -- ミリ秒
    peak_concurrent_users INTEGER DEFAULT 0,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 📊 パフォーマンス最適化インデックス（30名同時アクセス対応）
-- ============================================================================

-- 🚀 単語検索最適化
CREATE INDEX idx_words_category ON shared_words(school_type, grade_level, exam_type);
CREATE INDEX idx_words_difficulty ON shared_words(difficulty);
CREATE INDEX idx_words_english ON shared_words(english);
CREATE INDEX idx_words_japanese ON shared_words(japanese);
CREATE INDEX idx_words_usage ON shared_words(usage_frequency DESC, last_used_at DESC);
CREATE INDEX idx_words_verified ON shared_words(is_verified, difficulty);

-- 🔄 変更履歴検索
CREATE INDEX idx_history_table_record ON change_history(table_name, record_id);
CREATE INDEX idx_history_timestamp ON change_history(change_timestamp DESC);
CREATE INDEX idx_history_session ON change_history(session_id);

-- 📊 テスト管理最適化
CREATE INDEX idx_testsets_created ON shared_test_sets(created_at DESC);
CREATE INDEX idx_testsets_expires ON shared_test_sets(expires_at);
CREATE INDEX idx_testwords_order ON test_set_words(test_set_id, order_num);

-- 📈 統計最適化
CREATE INDEX idx_stats_date ON system_statistics(date DESC);

-- ============================================================================
-- 📊 初期システムデータ投入
-- ============================================================================

-- 📅 初期統計レコード
INSERT INTO system_statistics (date, total_words, words_added_today, tests_created_today, active_sessions)
VALUES (DATE('now'), 0, 0, 0, 0);

-- 🎯 システム情報記録
INSERT INTO change_history (table_name, record_id, action, new_data, source_ip, user_agent, session_id)
VALUES ('system', 'initialization', 'create', 
        '{"action": "database_initialized", "version": "1.0", "features": ["shared_access", "realtime_sync", "multi_device"]}',
        '127.0.0.1', 'system', 'init_session_' || datetime('now'));