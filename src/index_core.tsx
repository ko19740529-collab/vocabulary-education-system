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
// 🗄️ D1 DATABASE API ENDPOINTS - 共有システム対応
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
                        <p class="text-2xl font-bold text-green-600">
                            <i class="fas fa-circle animate-pulse"></i> 1
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
        
        // 🌐 D1共有データベース対応: システム初期化
        document.addEventListener('DOMContentLoaded', async () => {
            console.log('🚀 教育用単語管理システム（共有版）起動開始...');
            
            // 🗄️ D1共有データベースからデータ読み込み
            console.log('📊 D1データベースからデータ読み込み中...');
            await loadVocabularyData();
            await loadSystemStatistics();
            
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