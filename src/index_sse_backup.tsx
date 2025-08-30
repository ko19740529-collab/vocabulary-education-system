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
  
  // SSEレスポンスヘッダー設定
  const response = new Response(
    new ReadableStream({
      start(controller) {
        // 接続確立メッセージ
        const connectMessage = `data: ${JSON.stringify({
          type: 'connection_established',
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          message: 'リアルタイム同期が開始されました'
        })}\n\n`;
        
        controller.enqueue(new TextEncoder().encode(connectMessage));
        
        // 接続をプールに追加
        sseConnections.set(sessionId, controller);
        userSessions.set(sessionId, {
          sessionId,
          connectedAt: new Date(),
          lastActivity: new Date(),
          userAgent,
          ipAddress: clientIP
        });
        
        console.log(`🔗 新しいSSE接続: ${sessionId} (総接続数: ${sseConnections.size})`);
        
        // 他のユーザーに新規接続を通知
        broadcastToOthers(sessionId, {
          type: 'user_connected',
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          totalConnections: sseConnections.size
        });
        
        // 新規接続者に現在の接続数を送信
        const countUpdateMessage = `data: ${JSON.stringify({
          type: 'connection_count_update',
          totalConnections: sseConnections.size,
          timestamp: new Date().toISOString()
        })}\n\n`;
        controller.enqueue(new TextEncoder().encode(countUpdateMessage));
        
        // キープアライブ（30秒間隔）
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({
              type: 'keepalive',
              timestamp: new Date().toISOString()
            })}\n\n`));
          } catch (error) {
            clearInterval(keepAlive);
            cleanup();
          }
        }, 30000);
        
        // クリーンアップ関数
        const cleanup = () => {
          clearInterval(keepAlive);
          sseConnections.delete(sessionId);
          userSessions.delete(sessionId);
          
          console.log(`❌ SSE接続終了: ${sessionId} (残り接続数: ${sseConnections.size})`);
          
          // 他のユーザーに切断を通知
          broadcastToOthers(sessionId, {
            type: 'user_disconnected',
            sessionId: sessionId,
            timestamp: new Date().toISOString(),
            totalConnections: sseConnections.size
          });
        };
        
        // 接続終了時のクリーンアップ
        c.req.raw.signal?.addEventListener('abort', cleanup);
      }
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'X-Accel-Buffering': 'no', // Nginx buffering無効化
      }
    }
  );
  
  return response;
});

// 📢 全ユーザーへブロードキャスト
function broadcastToAll(message: any) {
  console.log(`📡 ブロードキャスト送信: ${message.type} to ${sseConnections.size} connections`);
  const messageData = `data: ${JSON.stringify(message)}\n\n`;
  const encoder = new TextEncoder();
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const [sessionId, controller] of sseConnections) {
    try {
      controller.enqueue(encoder.encode(messageData));
      successCount++;
    } catch (error) {
      console.error(`SSE送信エラー (${sessionId}):`, error);
      sseConnections.delete(sessionId);
      userSessions.delete(sessionId);
      errorCount++;
    }
  }
  
  console.log(`📊 ブロードキャスト結果: ${successCount}成功, ${errorCount}失敗`);
}

// 📢 特定ユーザー以外へブロードキャスト
function broadcastToOthers(excludeSessionId: string, message: any) {
  const messageData = `data: ${JSON.stringify(message)}\n\n`;
  const encoder = new TextEncoder();
  
  for (const [sessionId, controller] of sseConnections) {
    if (sessionId !== excludeSessionId) {
      try {
        controller.enqueue(encoder.encode(messageData));
      } catch (error) {
        console.error(`SSE送信エラー (${sessionId}):`, error);
        sseConnections.delete(sessionId);
        userSessions.delete(sessionId);
      }
    }
  }
}

// 📊 接続状況取得API
app.get('/api/connections', (c) => {
  const connections = Array.from(userSessions.values()).map(session => ({
    sessionId: session.sessionId,
    connectedAt: session.connectedAt,
    lastActivity: session.lastActivity,
    userAgent: session.userAgent.substring(0, 100), // セキュリティ対応で短縮
    ipAddress: session.ipAddress
  }));
  
  return c.json({
    success: true,
    totalConnections: sseConnections.size,
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
    
    // 🌐 リアルタイム通知: 全ユーザーに単語追加を通知
    const totalWordsResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM shared_words`).first();
    broadcastToAll({
      type: 'word_added',
      word: {
        id: wordId,
        japanese,
        english,
        phonetic: phonetic || null,
        difficulty: difficulty || 1,
        school_type: school_type || 'general',
        grade_level: grade_level || null,
        exam_type: exam_type || null,
        subject_area: subject_area || 'basic',
        created_at: new Date().toISOString()
      },
      timestamp: new Date().toISOString(),
      totalWords: totalWordsResult.total
    });
    
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
    
    // 🌐 リアルタイム通知: 全ユーザーに単語削除を通知
    const totalWordsAfterDelete = await env.DB.prepare(`SELECT COUNT(*) as total FROM shared_words`).first();
    broadcastToAll({
      type: 'word_deleted',
      wordId: wordId,
      deletedWord: oldData[0],
      timestamp: new Date().toISOString(),
      totalWords: totalWordsAfterDelete.total
    });
    
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 📊 システム統計取得
app.get('/api/statistics', async (c) => {
  try {
    const { env } = c;
    
    // 今日の統計
    const { results: todayStats } = await env.DB.prepare(`
      SELECT * FROM system_statistics WHERE date = DATE('now')
    `).all();
    
    // 単語総数
    const { results: wordCount } = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM shared_words
    `).all();
    
    return c.json({ 
      success: true, 
      statistics: {
        today: todayStats[0] || {},
        totalWords: wordCount[0]?.total || 0
      }
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ============================================================================
// 🎯 コア機能版 - シンプルUI
// ============================================================================

app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🌐 教育用単語管理システム（共有版）- D1テスト</title>
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
    </style>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
    
    <!-- Header -->
    <header class="bg-white shadow-lg border-b-4 border-blue-500">
        <div class="container mx-auto px-6 py-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <i class="fas fa-globe text-3xl text-blue-500"></i>
                    <div>
                        <h1 class="text-2xl font-bold text-gray-800">教育用単語管理システム</h1>
                        <p class="text-sm text-blue-600">🌐 共有版 - D1データベーステスト</p>
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
                            <i id="connectionIndicator" class="fas fa-circle animate-pulse"></i> 
                            <span id="onlineCount">0</span>
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-600">リアルタイム</p>
                        <p id="connectionStatus" class="text-sm font-bold text-yellow-600">
                            <i class="fas fa-wifi"></i> 接続中...
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
                        <button onclick="refreshData()" 
                                class="text-blue-500 hover:text-blue-700 transition-colors">
                            <i class="fas fa-sync-alt"></i> 更新
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
        // 🗄️ D1共有データベース対応: グローバル状態管理
        let vocabularyData = [];
        let systemStats = { totalWords: 0 };
        
        // 🌐 リアルタイム同期: SSE管理
        let eventSource = null;
        let sessionId = null;
        let connectionStatus = 'disconnected';
        let onlineUsers = 1; // 初期化：最低でも自分は接続中
        
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
                    // 🔄 共有データを再読み込み（全デバイス同期）
                    await loadVocabularyData();
                    await loadSystemStatistics();
                    updateWordList();
                    updateStatistics();
                    
                    // フォームクリア
                    document.getElementById('newJapanese').value = '';
                    document.getElementById('newEnglish').value = '';
                    
                    const displayText = english + ' → ' + japanese;
                    showNotification('✅ 単語が追加されました: ' + displayText, 'success');
                    
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
                    method: 'DELETE'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // 🔄 共有データを再読み込み（全デバイス同期）
                    await loadVocabularyData();
                    await loadSystemStatistics();
                    updateWordList();
                    updateStatistics();
                    
                    showNotification('✅ 単語が削除されました', 'success');
                    
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
        
        // データ再読み込み
        async function refreshData() {
            showNotification('🔄 データを更新中...', 'info');
            await loadVocabularyData();
            await loadSystemStatistics();
            updateWordList();
            updateStatistics();
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
        
        // 🌐 SSEリアルタイム同期システム初期化
        function initializeSSE() {
            console.log('🔗 SSEリアルタイム同期を開始...');
            
            eventSource = new EventSource('/api/sse');
            connectionStatus = 'connecting';
            
            eventSource.onopen = function(event) {
                connectionStatus = 'connected';
                console.log('✅ SSE接続が確立されました');
                updateConnectionStatus();
            };
            
            eventSource.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    handleSSEEvent(data);
                } catch (error) {
                    console.error('SSEデータ解析エラー:', error);
                }
            };
            
            eventSource.onerror = function(event) {
                connectionStatus = 'error';
                console.error('❌ SSE接続エラー:', event);
                updateConnectionStatus();
                
                // 自動再接続（5秒後）
                setTimeout(() => {
                    if (eventSource.readyState === EventSource.CLOSED) {
                        console.log('🔄 SSE自動再接続を試行...');
                        initializeSSE();
                    }
                }, 5000);
            };
        }
        
        // 🎯 SSEイベント処理
        function handleSSEEvent(data) {
            console.log('📡 SSEイベント受信:', data.type, data);
            
            switch(data.type) {
                case 'connection_established':
                    sessionId = data.sessionId;
                    showNotification('🌐 リアルタイム同期が開始されました', 'info');
                    break;
                    
                case 'connection_count_update':
                    onlineUsers = data.totalConnections;
                    updateConnectionStatus();
                    console.log('📊 接続数更新:', onlineUsers);
                    break;
                    
                case 'word_added':
                    // 他のユーザーが単語を追加した場合の処理
                    if (data.word) {
                        const newWord = {
                            id: data.word.id,
                            japanese: data.word.japanese,
                            english: data.word.english,
                            createdAt: data.word.created_at,
                            difficulty: data.word.difficulty,
                            schoolType: data.word.school_type,
                            gradeLevel: data.word.grade_level,
                            examType: data.word.exam_type,
                            subjectArea: data.word.subject_area,
                            usageFrequency: 0,
                            isVerified: false
                        };
                        
                        vocabularyData.unshift(newWord); // 最新を先頭に
                        systemStats.totalWords = data.totalWords;
                        
                        updateWordList();
                        updateStatistics();
                        
                        showNotification('🆕 新しい単語が追加されました: ' + data.word.english + ' → ' + data.word.japanese, 'info');
                    }
                    break;
                    
                case 'word_deleted':
                    // 他のユーザーが単語を削除した場合の処理
                    if (data.wordId) {
                        vocabularyData = vocabularyData.filter(word => word.id !== data.wordId);
                        systemStats.totalWords = data.totalWords;
                        
                        updateWordList();
                        updateStatistics();
                        
                        if (data.deletedWord) {
                            showNotification('🗑️ 単語が削除されました: ' + data.deletedWord.english + ' → ' + data.deletedWord.japanese, 'info');
                        }
                    }
                    break;
                    
                case 'user_connected':
                    onlineUsers = data.totalConnections;
                    updateConnectionStatus();
                    showNotification('👥 新しいユーザーが参加しました（オンライン: ' + onlineUsers + '名）', 'info');
                    break;
                    
                case 'user_disconnected':
                    onlineUsers = data.totalConnections;
                    updateConnectionStatus();
                    break;
                    
                case 'keepalive':
                    // キープアライブ - 処理不要
                    break;
                    
                default:
                    console.log('🔍 未知のSSEイベント:', data.type);
            }
        }
        
        // 接続状況UI更新
        function updateConnectionStatus() {
            const statusElement = document.getElementById('connectionStatus');
            const indicatorElement = document.getElementById('connectionIndicator');
            const countElement = document.getElementById('onlineCount');
            
            if (statusElement && indicatorElement && countElement) {
                console.log('🔄 updateConnectionStatus: onlineUsers =', onlineUsers, 'connectionStatus =', connectionStatus);
                countElement.textContent = onlineUsers;
                
                switch(connectionStatus) {
                    case 'connected':
                        statusElement.innerHTML = '<i class="fas fa-wifi"></i> 同期中';
                        statusElement.className = 'text-sm font-bold text-green-600';
                        indicatorElement.className = 'fas fa-circle animate-pulse text-green-500';
                        break;
                    case 'connecting':
                        statusElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 接続中';
                        statusElement.className = 'text-sm font-bold text-yellow-600';
                        indicatorElement.className = 'fas fa-circle animate-pulse text-yellow-500';
                        break;
                    case 'error':
                        statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> エラー';
                        statusElement.className = 'text-sm font-bold text-red-600';
                        indicatorElement.className = 'fas fa-circle text-red-500';
                        break;
                    default:
                        statusElement.innerHTML = '<i class="fas fa-wifi"></i> オフライン';
                        statusElement.className = 'text-sm font-bold text-gray-600';
                        indicatorElement.className = 'fas fa-circle text-gray-500';
                }
            }
        }
        
        // 🌐 D1共有データベース対応: システム初期化
        document.addEventListener('DOMContentLoaded', async () => {
            console.log('🚀 教育用単語管理システム（共有版）起動開始...');
            
            // 🗄️ D1共有データベースからデータ読み込み
            console.log('📊 D1データベースからデータ読み込み中...');
            await loadVocabularyData();
            await loadSystemStatistics();
            
            // 🌐 SSEリアルタイム同期開始
            initializeSSE();
            
            // UI更新
            updateWordList();
            updateStatistics();
            
            console.log('🎉 教育用単語管理システム（共有版）完全起動完了');
            console.log('📚 ' + vocabularyData.length + '個の単語がD1データベースから読み込まれました');
            console.log('🌐 30名同時アクセス対応');
            console.log('🔄 リアルタイム同期準備完了');
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
    </script>
</body>
</html>
  `)
})

export default app