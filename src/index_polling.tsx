import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// 🗄️ D1データベース型定義
type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// ============================================================================
// 🔄 REAL-TIME SYNC SYSTEM - ポーリング基盤（30名同時接続対応）
// ============================================================================

// 接続セッション管理（ポーリング用）
const activeSessions = new Map<string, {
  sessionId: string;
  lastSeen: Date;
  userAgent: string;
  ipAddress: string;
}>();

// セッションクリーンアップ（5分間非アクティブで削除）
setInterval(() => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [sessionId, session] of activeSessions) {
    if (session.lastSeen < fiveMinutesAgo) {
      activeSessions.delete(sessionId);
      console.log(`🧹 非アクティブセッション削除: ${sessionId}`);
    }
  }
}, 60 * 1000); // 1分間隔でクリーンアップ

// 🔄 ポーリング用セッション管理API
app.post('/api/session/heartbeat', (c) => {
  const sessionId = c.req.header('X-Session-Id') || `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const userAgent = c.req.header('User-Agent') || 'unknown';
  
  // セッションを更新または作成
  activeSessions.set(sessionId, {
    sessionId,
    lastSeen: new Date(),
    userAgent,
    ipAddress: clientIP
  });
  
  return c.json({
    success: true,
    sessionId: sessionId,
    totalConnections: activeSessions.size,
    timestamp: new Date().toISOString()
  });
});

// 🔄 変更チェック用API（ポーリング用）
app.get('/api/changes', async (c) => {
  try {
    const { env } = c;
    const lastCheck = c.req.query('since') || '1970-01-01T00:00:00.000Z';
    
    // 最新の変更をチェック
    const { results: recentChanges } = await env.DB.prepare(`
      SELECT table_name, record_id, action, created_at, new_data, old_data
      FROM change_history 
      WHERE created_at > ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `).bind(lastCheck).all();
    
    // 最新の統計情報
    const { results: stats } = await env.DB.prepare(`
      SELECT COUNT(*) as totalWords FROM shared_words
    `).all();
    
    return c.json({
      success: true,
      changes: recentChanges,
      totalWords: stats[0]?.totalWords || 0,
      totalConnections: activeSessions.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 📊 接続状況取得API（ポーリング用）
app.get('/api/connections', (c) => {
  const connections = Array.from(activeSessions.values()).map(session => ({
    sessionId: session.sessionId,
    lastSeen: session.lastSeen,
    userAgent: session.userAgent.substring(0, 100),
    ipAddress: session.ipAddress
  }));
  
  return c.json({
    success: true,
    totalConnections: activeSessions.size,
    connections: connections
  });
});

// ============================================================================
// 🗄️ D1 DATABASE API ENDPOINTS - リアルタイム同期対応
// ============================================================================

// 📚 単語一覧取得
app.get('/api/words', async (c) => {
  try {
    const { env } = c;
    const { results } = await env.DB.prepare(`
      SELECT id, japanese, english, phonetic, difficulty, school_type, grade_level, 
             exam_type, subject_area, usage_frequency, is_verified, created_at, updated_at
      FROM shared_words 
      ORDER BY usage_frequency DESC, created_at DESC
    `).all();
    
    return c.json({ success: true, words: results });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ➕ 新単語追加
app.post('/api/words', async (c) => {
  try {
    const { env } = c;
    const body = await c.req.json();
    const { japanese, english, phonetic, difficulty, school_type, grade_level, exam_type, subject_area } = body;
    
    // 入力検証
    if (!japanese || !english) {
      return c.json({ success: false, error: '日本語と英語は必須です' }, 400);
    }
    
    const wordId = `word_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';
    
    // 単語をD1に追加
    const insertResult = await env.DB.prepare(`
      INSERT INTO shared_words 
      (id, japanese, english, phonetic, difficulty, school_type, grade_level, exam_type, subject_area, 
       created_from_ip, updated_from_ip, created_user_agent, updated_user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      wordId, japanese, english, phonetic || null, difficulty || 1, 
      school_type || 'general', grade_level || null, exam_type || null, subject_area || 'basic',
      clientIP, clientIP, userAgent, userAgent
    ).run();
    
    // 変更履歴記録
    await env.DB.prepare(`
      INSERT INTO change_history (table_name, record_id, action, new_data, source_ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      'shared_words', wordId, 'create', 
      JSON.stringify({ japanese, english, phonetic, difficulty, school_type, grade_level, exam_type, subject_area }),
      clientIP, userAgent
    ).run();
    
    // 統計更新
    await env.DB.prepare(`
      UPDATE system_statistics 
      SET words_added_today = words_added_today + 1, total_words = total_words + 1 
      WHERE date = DATE('now')
    `).run();
    
    console.log(`🆕 新単語追加: ${english} → ${japanese} (ID: ${wordId})`);
    
    return c.json({ success: true, wordId: wordId });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 🗑️ 単語削除
app.delete('/api/words/:id', async (c) => {
  try {
    const { env } = c;
    const wordId = c.req.param('id');
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';
    
    // 既存データ取得（履歴用）
    const { results: oldData } = await env.DB.prepare(`
      SELECT * FROM shared_words WHERE id = ?
    `).bind(wordId).all();
    
    if (oldData.length === 0) {
      return c.json({ success: false, error: '単語が見つかりません' }, 404);
    }
    
    // 単語削除
    await env.DB.prepare(`DELETE FROM shared_words WHERE id = ?`).bind(wordId).run();
    
    // 変更履歴記録
    await env.DB.prepare(`
      INSERT INTO change_history (table_name, record_id, action, old_data, source_ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      'shared_words', wordId, 'delete', JSON.stringify(oldData[0]), clientIP, userAgent
    ).run();
    
    // 統計更新
    await env.DB.prepare(`
      UPDATE system_statistics 
      SET total_words = total_words - 1 
      WHERE date = DATE('now')
    `).run();
    
    console.log(`🗑️ 単語削除: ${oldData[0].english} → ${oldData[0].japanese} (ID: ${wordId})`);
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 📊 システム統計取得
app.get('/api/statistics', async (c) => {
  try {
    const { env } = c;
    const { results } = await env.DB.prepare(`
      SELECT COUNT(*) as totalWords FROM shared_words
    `).all();
    
    return c.json({
      success: true,
      statistics: {
        totalWords: results[0]?.totalWords || 0,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ============================================================================
// 🌐 FRONTEND - ポーリング対応リアルタイム同期システム
// ============================================================================

// メインページ
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔄 教育用単語管理システム（ポーリング版）- D1リアルタイム</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        .premium-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 2px solid rgba(59, 130, 246, 0.2);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
            border-radius: 16px;
        }
        
        .premium-button {
            background: linear-gradient(45deg, #3b82f6, #8b5cf6);
            transition: all 0.3s ease;
        }
        
        .premium-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
        }
        
        .word-item {
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            transition: all 0.3s ease;
        }
        
        .word-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }
        
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            max-width: 400px;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        }
        
        .notification.show {
            opacity: 1;
            transform: translateX(0);
        }
        
        @keyframes pulse-green {
            0%, 100% { color: #10b981; }
            50% { color: #34d399; }
        }
        
        .polling-indicator {
            animation: pulse-green 2s infinite;
        }
    </style>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
    
    <!-- Header -->
    <header class="bg-white shadow-lg border-b-4 border-blue-500">
        <div class="container mx-auto px-6 py-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <i class="fas fa-sync-alt text-3xl text-blue-500"></i>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-800">教育用単語管理システム</h1>
                        <p class="text-sm text-blue-600">🔄 ポーリング版 - リアルタイム同期</p>
                    </div>
                </div>
                <div class="flex items-center space-x-4">
                    <div class="text-right">
                        <p class="text-sm text-gray-600">総単語数</p>
                        <p id="totalWords" class="text-2xl font-bold text-blue-600">0</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-600">オンライン</p>
                        <p id="onlineUsers" class="text-2xl font-bold text-green-600">
                            <i id="connectionIndicator" class="fas fa-circle"></i> 
                            <span id="onlineCount">0</span>
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-600">同期状態</p>
                        <p id="syncStatus" class="text-sm font-bold">
                            <i class="fas fa-sync-alt polling-indicator"></i> ポーリング中...
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </header>
    
    <!-- Main Content -->
    <div class="container mx-auto px-6 py-8">
        <div class="grid lg:grid-cols-3 gap-8">
            
            <!-- 単語追加パネル -->
            <div class="premium-card p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-6">
                    <i class="fas fa-plus-circle text-green-500 mr-2"></i>
                    新しい単語を追加
                </h2>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">英語</label>
                        <input type="text" id="newEnglish" 
                               placeholder="例: apple" 
                               class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-bold text-gray-700 mb-2">日本語</label>
                        <input type="text" id="newJapanese" 
                               placeholder="例: りんご"
                               class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    </div>
                    
                    <button onclick="addWord()" 
                            class="premium-button w-full text-white font-bold py-3 px-6 rounded-xl">
                        <i class="fas fa-plus mr-2"></i>追加
                    </button>
                </div>
            </div>
            
            <!-- 単語一覧パネル -->
            <div class="lg:col-span-2">
                <div class="premium-card p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-xl font-bold text-gray-800">
                            <i class="fas fa-list text-blue-500 mr-2"></i>
                            登録済み単語
                        </h2>
                        <button onclick="manualRefresh()" 
                                class="text-blue-500 hover:text-blue-700 transition-colors">
                            <i class="fas fa-sync-alt"></i> 手動更新
                        </button>
                    </div>
                    
                    <div id="wordList" class="space-y-2 max-h-96 overflow-y-auto">
                        <div class="text-center text-gray-500 py-8">
                            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                            <p>データを読み込み中...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- 通知エリア -->
    <div id="notification" class="notification"></div>
    
    <script>
        // 🔄 ポーリング対応グローバル状態管理
        let vocabularyData = [];
        let systemStats = { totalWords: 0 };
        let sessionId = null;
        let lastChangeCheck = new Date().toISOString();
        let pollingInterval = null;
        let onlineUsers = 1;
        let syncStatus = 'connecting';
        
        // 🔄 セッション初期化とハートビート
        async function initializeSession() {
            try {
                const response = await fetch('/api/session/heartbeat', {
                    method: 'POST',
                    headers: {
                        'X-Session-Id': sessionId
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    sessionId = result.sessionId;
                    onlineUsers = result.totalConnections;
                    updateSyncStatus('connected');
                    console.log('✅ セッション初期化完了:', sessionId);
                } else {
                    updateSyncStatus('error');
                }
            } catch (error) {
                console.error('セッション初期化エラー:', error);
                updateSyncStatus('error');
            }
        }
        
        // 🔄 変更チェック（ポーリング）
        async function checkForChanges() {
            try {
                const response = await fetch('/api/changes?since=' + encodeURIComponent(lastChangeCheck), {
                    headers: {
                        'X-Session-Id': sessionId
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // セッション情報更新
                    onlineUsers = result.totalConnections;
                    systemStats.totalWords = result.totalWords;
                    
                    // 変更があった場合の処理
                    if (result.changes && result.changes.length > 0) {
                        console.log('🔄 変更を検出:', result.changes.length + '件');
                        
                        // 単語データを再読み込み
                        await loadVocabularyData();
                        updateWordList();
                        
                        // 変更通知
                        for (const change of result.changes) {
                            if (change.action === 'create') {
                                const data = JSON.parse(change.new_data);
                                showNotification('🆕 新しい単語: ' + data.english + ' → ' + data.japanese, 'info');
                            } else if (change.action === 'delete') {
                                const data = JSON.parse(change.old_data);
                                showNotification('🗑️ 単語削除: ' + data.english + ' → ' + data.japanese, 'info');
                            }
                        }
                    }
                    
                    lastChangeCheck = result.timestamp;
                    updateSyncStatus('connected');
                    updateConnectionStatus();
                } else {
                    updateSyncStatus('error');
                }
            } catch (error) {
                console.error('変更チェックエラー:', error);
                updateSyncStatus('error');
            }
        }
        
        // 🔄 定期ポーリング開始
        function startPolling() {
            // 3秒間隔でポーリング
            pollingInterval = setInterval(checkForChanges, 3000);
            console.log('🔄 ポーリング開始（3秒間隔）');
        }
        
        // 同期状態UI更新
        function updateSyncStatus(status) {
            syncStatus = status;
            const statusElement = document.getElementById('syncStatus');
            const indicatorElement = document.getElementById('connectionIndicator');
            
            if (statusElement && indicatorElement) {
                switch(status) {
                    case 'connected':
                        statusElement.innerHTML = '<i class="fas fa-check-circle text-green-500"></i> 同期中';
                        statusElement.className = 'text-sm font-bold text-green-600';
                        indicatorElement.className = 'fas fa-circle text-green-500 polling-indicator';
                        break;
                    case 'connecting':
                        statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 接続中...';
                        statusElement.className = 'text-sm font-bold text-yellow-600';
                        indicatorElement.className = 'fas fa-circle text-yellow-500';
                        break;
                    case 'error':
                        statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> エラー';
                        statusElement.className = 'text-sm font-bold text-red-600';
                        indicatorElement.className = 'fas fa-circle text-red-500';
                        break;
                }
            }
        }
        
        function updateConnectionStatus() {
            const countElement = document.getElementById('onlineCount');
            if (countElement) {
                countElement.textContent = onlineUsers;
            }
        }
        
        // 🌐 D1データベースから単語データ読み込み
        async function loadVocabularyData() {
            try {
                const response = await fetch('/api/words');
                const result = await response.json();
                
                if (result.success) {
                    vocabularyData = result.words.map(word => ({
                        id: word.id,
                        japanese: word.japanese,
                        english: word.english,
                        createdAt: word.created_at,
                        difficulty: word.difficulty,
                        schoolType: word.school_type,
                        gradeLevel: word.grade_level,
                        examType: word.exam_type,
                        subjectArea: word.subject_area,
                        usageFrequency: word.usage_frequency,
                        isVerified: word.is_verified
                    }));
                    console.log('✅ D1から' + vocabularyData.length + '個の単語を読み込みました');
                } else {
                    console.error('単語データの読み込みに失敗:', result.error);
                    showNotification('❌ データの読み込みに失敗しました', 'error');
                }
            } catch (error) {
                console.error('D1データ読み込みエラー:', error);
                showNotification('❌ データベース接続エラー', 'error');
            }
        }
        
        // 📊 システム統計読み込み
        async function loadSystemStatistics() {
            try {
                const response = await fetch('/api/statistics');
                const result = await response.json();
                
                if (result.success) {
                    systemStats.totalWords = result.statistics.totalWords;
                }
            } catch (error) {
                console.error('統計データ読み込みエラー:', error);
            }
        }
        
        // 🗄️ D1 API対応: 単語追加（共有データベース）
        async function addWord() {
            const japanese = document.getElementById('newJapanese').value.trim();
            const english = document.getElementById('newEnglish').value.trim();
            
            if (!japanese || !english) {
                showNotification('日本語と英語を入力してください', 'error');
                return;
            }
            
            try {
                const response = await fetch('/api/words', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Id': sessionId
                    },
                    body: JSON.stringify({
                        japanese,
                        english,
                        phonetic: null,
                        difficulty: 1,
                        school_type: 'general',
                        grade_level: null,
                        exam_type: null,
                        subject_area: 'basic'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // フォームクリア
                    document.getElementById('newJapanese').value = '';
                    document.getElementById('newEnglish').value = '';
                    
                    showNotification('✅ 単語が追加されました: ' + english + ' → ' + japanese, 'success');
                    
                    // すぐに変更をチェック（リアルタイム感を向上）
                    setTimeout(checkForChanges, 500);
                    
                } else {
                    showNotification('❌ エラー: ' + result.error, 'error');
                }
                
            } catch (error) {
                console.error('単語追加エラー:', error);
                showNotification('❌ ネットワークエラーが発生しました', 'error');
            }
        }
        
        // 🗄️ D1 API対応: 単語削除（共有データベース）
        async function deleteWord(id) {
            try {
                const response = await fetch('/api/words/' + id, {
                    method: 'DELETE',
                    headers: {
                        'X-Session-Id': sessionId
                    }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('✅ 単語が削除されました', 'success');
                    
                    // すぐに変更をチェック
                    setTimeout(checkForChanges, 500);
                    
                } else {
                    showNotification('❌ エラー: ' + result.error, 'error');
                }
                
            } catch (error) {
                console.error('単語削除エラー:', error);
                showNotification('❌ 削除に失敗しました', 'error');
            }
        }
        
        // UI更新関数
        function updateWordList() {
            const wordList = document.getElementById('wordList');
            if (!wordList) return;
            
            if (vocabularyData.length === 0) {
                wordList.innerHTML = '<div class="text-center text-gray-500 py-8">登録された単語がありません</div>';
                return;
            }
            
            wordList.innerHTML = vocabularyData.map(word => 
                '<div class="word-item p-4 flex justify-between items-center" data-word-id="' + word.id + '">' +
                    '<div class="flex-1">' +
                        '<div class="flex items-center gap-3">' +
                            '<span class="font-semibold text-gray-800">' + word.english + '</span>' +
                            '<i class="fas fa-arrow-right text-gray-400"></i>' +
                            '<span class="text-gray-600">' + word.japanese + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<button onclick="deleteWord(' + "'" + word.id + "'" + ')" ' +
                            'class="text-red-500 hover:text-red-700 transition-colors">' +
                        '<i class="fas fa-trash"></i>' +
                    '</button>' +
                '</div>'
            ).join('');
        }
        
        function updateStatistics() {
            const totalWordsElement = document.getElementById('totalWords');
            if (totalWordsElement) {
                totalWordsElement.textContent = vocabularyData.length;
            }
        }
        
        // 手動更新
        async function manualRefresh() {
            showNotification('🔄 データを手動更新中...', 'info');
            await checkForChanges();
            showNotification('✅ データが更新されました', 'success');
        }
        
        // 通知システム
        function showNotification(message, type) {
            const notification = document.getElementById('notification');
            let bgColor, icon;
            
            switch(type) {
                case 'success':
                    bgColor = 'bg-green-500';
                    icon = 'fa-check-circle';
                    break;
                case 'error':
                    bgColor = 'bg-red-500';
                    icon = 'fa-exclamation-circle';
                    break;
                case 'info':
                    bgColor = 'bg-blue-500';
                    icon = 'fa-info-circle';
                    break;
                default:
                    bgColor = 'bg-gray-500';
                    icon = 'fa-bell';
            }
            
            notification.className = 'notification ' + bgColor + ' text-white p-4 rounded-xl shadow-lg';
            notification.innerHTML = 
                '<div class="flex items-start">' +
                    '<i class="fas ' + icon + ' mr-3 text-lg mt-1"></i>' +
                    '<span class="font-semibold">' + message + '</span>' +
                '</div>';
            
            notification.classList.add('show');
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, type === 'info' ? 2000 : 5000);
        }
        
        // 🔄 ポーリング版システム初期化
        document.addEventListener('DOMContentLoaded', async () => {
            console.log('🚀 教育用単語管理システム（ポーリング版）起動開始...');
            
            // 初期セッション設定
            await initializeSession();
            
            // データ読み込み
            console.log('📊 D1データベースからデータ読み込み中...');
            await loadVocabularyData();
            await loadSystemStatistics();
            
            // UI更新
            updateWordList();
            updateStatistics();
            
            // ポーリング開始
            startPolling();
            
            console.log('🎉 教育用単語管理システム（ポーリング版）完全起動完了');
            console.log('📚 ' + vocabularyData.length + '個の単語がD1データベースから読み込まれました');
            console.log('🔄 3秒間隔でリアルタイム同期開始');
            console.log('🌐 30名同時アクセス対応');
        });
        
        // エンターキーでの追加
        document.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const focusedElement = document.activeElement;
                if (focusedElement && (focusedElement.id === 'newEnglish' || focusedElement.id === 'newJapanese')) {
                    addWord();
                }
            }
        });
        
        // ページ離脱時のクリーンアップ
        window.addEventListener('beforeunload', () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        });
    </script>
</body>
</html>
  `)
})

export default app