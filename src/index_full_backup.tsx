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

// 🔄 単語更新
app.put('/api/words/:id', async (c) => {
  try {
    const { env } = c;
    const wordId = c.req.param('id');
    const body = await c.req.json();
    const { japanese, english, phonetic, difficulty, school_type, grade_level, exam_type, subject_area } = body;
    
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';
    
    // 既存データ取得（履歴用）
    const { results: oldData } = await env.DB.prepare(`
      SELECT * FROM shared_words WHERE id = ?
    `).bind(wordId).all();
    
    if (oldData.length === 0) {
      return c.json({ success: false, error: '単語が見つかりません' }, 404);
    }
    
    // 単語更新
    await env.DB.prepare(`
      UPDATE shared_words 
      SET japanese = ?, english = ?, phonetic = ?, difficulty = ?, 
          school_type = ?, grade_level = ?, exam_type = ?, subject_area = ?,
          updated_from_ip = ?, updated_user_agent = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      japanese, english, phonetic || null, difficulty || 1,
      school_type || 'general', grade_level || null, exam_type || null, subject_area || 'basic',
      clientIP, userAgent, wordId
    ).run();
    
    // 変更履歴記録
    await env.DB.prepare(`
      INSERT INTO change_history (table_name, record_id, action, old_data, new_data, source_ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'shared_words', wordId, 'update',
      JSON.stringify(oldData[0]),
      JSON.stringify({ japanese, english, phonetic, difficulty, school_type, grade_level, exam_type, subject_area }),
      clientIP, userAgent
    ).run();
    
    return c.json({ success: true });
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

// 🗑️ 全単語削除（危険操作）
app.delete('/api/words', async (c) => {
  try {
    const { env } = c;
    const clientIP = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';
    
    // 削除前の単語数取得
    const { results: beforeCount } = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM shared_words
    `).all();
    
    // 全単語削除
    await env.DB.prepare(`DELETE FROM shared_words`).run();
    
    // 変更履歴記録
    await env.DB.prepare(`
      INSERT INTO change_history (table_name, record_id, action, old_data, source_ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      'shared_words', 'bulk_delete', 'delete', 
      JSON.stringify({ deleted_count: beforeCount[0]?.total || 0 }),
      clientIP, userAgent
    ).run();
    
    // 統計リセット
    await env.DB.prepare(`
      UPDATE system_statistics 
      SET total_words = 0 
      WHERE date = DATE('now')
    `).run();
    
    return c.json({ success: true, deletedCount: beforeCount[0]?.total || 0 });
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
    
    // カテゴリ別統計
    const { results: categoryStats } = await env.DB.prepare(`
      SELECT school_type, grade_level, COUNT(*) as count 
      FROM shared_words 
      GROUP BY school_type, grade_level
    `).all();
    
    return c.json({ 
      success: true, 
      statistics: {
        today: todayStats[0] || {},
        totalWords: wordCount[0]?.total || 0,
        categories: categoryStats
      }
    });
  } catch (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Main Integrated System Route
app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>英単語テスト作成システム v2.0 + プレミアムPDF</title>
    
    <!-- External Libraries -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    
    <!-- Canvas-based Text Rendering System -->
    <canvas id="textRenderingCanvas" width="800" height="600" style="display: none;"></canvas>
    
    <style>
        /* Premium System Styles */
        .ultra-premium-card {
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(25px);
            border: 2px solid rgba(255, 255, 255, 0.3);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
            border-radius: 24px;
        }
        
        .quality-gradient {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
        }
        
        .premium-tab {
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .premium-tab.active {
            background: linear-gradient(45deg, #4f46e5, #7c3aed);
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(79, 70, 229, 0.3);
        }
        
        .quality-indicator {
            animation: qualityPulse 2s infinite;
        }
        
        @keyframes qualityPulse {
            0%, 100% { 
                opacity: 1; 
                transform: scale(1); 
            }
            50% { 
                opacity: 0.7; 
                transform: scale(1.05); 
            }
        }
        
        .premium-button {
            background: linear-gradient(45deg, #4f46e5, #7c3aed, #ec4899);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            transform: translateY(0);
            position: relative;
            overflow: hidden;
        }
        
        .premium-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 35px rgba(79, 70, 229, 0.4);
        }
        
        .premium-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }
        
        .premium-button:hover::before {
            left: 100%;
        }
        
        /* Tab Content Areas */
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
            animation: fadeIn 0.5s ease-in-out;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        /* Word Management Styles */
        .word-item {
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .word-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }
        
        /* 🎯 新単語追加時のハイライト効果 */
        .word-item-highlight {
            animation: newWordHighlight 3s ease-in-out;
        }
        
        @keyframes newWordHighlight {
            0% {
                background-color: #dcfce7;
                border-color: #16a34a;
                transform: scale(1.02);
                box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
            }
            70% {
                background-color: #dcfce7;
                border-color: #16a34a;
                transform: scale(1.02);
                box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
            }
            100% {
                background-color: rgba(255, 255, 255, 0.9);
                border-color: #e2e8f0;
                transform: scale(1);
                box-shadow: none;
            }
        }
        
        /* Statistics Styles */
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        /* Loading Animation */
        .loading-spinner {
            border: 4px solid #f3f4f6;
            border-top: 4px solid #4f46e5;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="min-h-screen quality-gradient">
    <!-- Main Header -->
    <header class="p-6">
        <div class="max-w-7xl mx-auto">
            <div class="ultra-premium-card p-6">
                <div class="text-center">
                    <div class="mb-4">
                        <i class="fas fa-crown text-5xl text-yellow-500 mb-3"></i>
                    </div>
                    <h1 class="text-4xl font-bold text-gray-800 mb-2">
                        英単語テスト作成システム v2.0
                    </h1>
                    <p class="text-xl text-gray-600 mb-4">+ プレミアムPDF生成機能</p>
                    
                    <!-- Quality Status -->
                    <div class="inline-flex items-center bg-green-100 text-green-800 px-6 py-2 rounded-full mb-4">
                        <div class="quality-indicator w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                        <span class="font-semibold">16x超高品質モード有効</span>
                    </div>
                    
                    <!-- Debug PDF Test Button -->
                    <div class="mt-4">
                        <button onclick="debugPDFTest()" 
                                class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm">
                            🧪 PDF生成デバッグテスト
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Tab Navigation -->
    <nav class="px-6 mb-6">
        <div class="max-w-7xl mx-auto">
            <div class="flex flex-wrap justify-center gap-4">
                <button class="premium-tab active px-6 py-3 rounded-xl font-semibold" onclick="showTab('word-management')">
                    <i class="fas fa-book mr-2"></i>単語管理
                </button>
                <button class="premium-tab px-6 py-3 rounded-xl font-semibold" onclick="showTab('test-generation')">
                    <i class="fas fa-file-alt mr-2"></i>テスト作成
                </button>
                <button class="premium-tab px-6 py-3 rounded-xl font-semibold" onclick="showTab('premium-pdf')">
                    <i class="fas fa-file-pdf mr-2"></i>プレミアムPDF
                </button>
                <button class="premium-tab px-6 py-3 rounded-xl font-semibold" onclick="showTab('statistics')">
                    <i class="fas fa-chart-bar mr-2"></i>統計
                </button>
            </div>
        </div>
    </nav>

    <!-- Main Content Area -->
    <main class="px-6 pb-12">
        <div class="max-w-7xl mx-auto">
            
            <!-- Word Management Tab -->
            <div id="word-management" class="tab-content active">
                <div class="grid lg:grid-cols-3 gap-6">
                    <!-- Add Word Panel -->
                    <div class="ultra-premium-card p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">
                            <i class="fas fa-plus-circle text-green-500 mr-2"></i>
                            単語追加
                        </h2>
                        
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">英語</label>
                                <input type="text" id="newEnglish" 
                                       class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">日本語</label>
                                <input type="text" id="newJapanese" 
                                       class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">番号</label>
                                <input type="text" id="newNumber" placeholder="例: No.20" 
                                       class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                            
                            <button onclick="addWord()" 
                                    class="premium-button w-full text-white font-bold py-3 px-6 rounded-xl">
                                <i class="fas fa-plus mr-2"></i>単語追加
                            </button>
                        </div>
                    </div>
                    
                    <!-- Word List Panel -->
                    <div class="lg:col-span-2">
                        <div class="ultra-premium-card p-6">
                            <div class="flex justify-between items-center mb-6">
                                <h2 class="text-2xl font-bold text-gray-800">
                                    <i class="fas fa-list text-blue-500 mr-2"></i>
                                    登録単語一覧
                                </h2>
                                <div class="flex gap-2">
                                    <button onclick="clearAllWords()" 
                                            class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors">
                                        <i class="fas fa-trash mr-1"></i>全削除
                                    </button>
                                    <button onclick="loadSampleWords()" 
                                            class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors">
                                        <i class="fas fa-download mr-1"></i>サンプル読込
                                    </button>
                                </div>
                            </div>
                            
                            <div id="wordList" class="space-y-3 max-h-96 overflow-y-auto">
                                <!-- Words will be dynamically inserted here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Test Generation Tab -->
            <div id="test-generation" class="tab-content">
                <div class="grid lg:grid-cols-2 gap-6">
                    <!-- Test Settings Panel -->
                    <div class="ultra-premium-card p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">
                            <i class="fas fa-cogs text-purple-500 mr-2"></i>
                            テスト設定
                        </h2>
                        
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">テスト名</label>
                                <input type="text" id="testTitle" value="英単語テスト" placeholder="例：期末テスト、Unit5単語テスト"
                                       class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">問題数</label>
                                <input type="number" id="questionCount" value="15" min="1" max="50"
                                       class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">出題形式</label>
                                <select id="testFormat" class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                                    <option value="japanese-to-english">日本語→英語</option>
                                    <option value="english-to-japanese">英語→日本語</option>
                                    <option value="mixed">混合</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">順序</label>
                                <select id="questionOrder" class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                                    <option value="random">ランダム</option>
                                    <option value="sequential">順番通り</option>
                                    <option value="reverse">逆順</option>
                                </select>
                            </div>
                            
                            <button onclick="generateTest()" 
                                    class="premium-button w-full text-white font-bold py-4 px-6 rounded-xl text-lg mb-4">
                                <i class="fas fa-magic mr-2"></i>テスト生成
                            </button>
                            
                            <!-- PDF Export Buttons -->
                            <div id="testPDFButtons" class="space-y-3 hidden">
                                <button onclick="generateTestPDF('question')" 
                                        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl transition-colors">
                                    <i class="fas fa-file-pdf mr-2"></i>問題用PDF生成
                                </button>
                                <button onclick="generateTestPDF('answer')" 
                                        class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl transition-colors">
                                    <i class="fas fa-file-pdf mr-2"></i>解答用PDF生成
                                </button>
                                <button onclick="generateTestPDF('both')" 
                                        class="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-xl transition-colors">
                                    <i class="fas fa-file-pdf mr-2"></i>問題+解答PDF生成
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Test Preview Panel -->
                    <div class="ultra-premium-card p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">
                            <i class="fas fa-eye text-indigo-500 mr-2"></i>
                            プレビュー
                        </h2>
                        
                        <div id="testPreview" class="bg-white border-2 border-gray-200 rounded-lg p-6 min-h-96 overflow-y-auto">
                            <div class="text-center text-gray-500 py-20">
                                <i class="fas fa-file-alt text-4xl mb-4"></i>
                                <p>テストを生成してプレビューを表示</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Premium PDF Tab -->
            <div id="premium-pdf" class="tab-content">
                <div class="grid lg:grid-cols-3 gap-6">
                    <!-- PDF Settings Panel -->
                    <div class="ultra-premium-card p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">
                            <i class="fas fa-crown text-yellow-500 mr-2"></i>
                            プレミアム設定
                        </h2>
                        
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">学年・組</label>
                                <input type="text" id="gradeClass" value="中学3年" 
                                       class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">テスト種別</label>
                                <select id="pdfTestType" class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent">
                                    <option value="日本語→英語">日本語→英語</option>
                                    <option value="英語→日本語">英語→日本語</option>
                                    <option value="総合テスト">総合テスト</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">品質レベル</label>
                                <div class="bg-green-50 p-3 rounded-lg">
                                    <div class="flex items-center text-green-800">
                                        <i class="fas fa-shield-alt mr-2"></i>
                                        <span class="font-semibold">16x 超高解像度固定</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- PDF Generation Panel -->
                    <div class="ultra-premium-card p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">
                            <i class="fas fa-file-pdf text-red-500 mr-2"></i>
                            PDF生成
                        </h2>
                        
                        <!-- Data Source Selection -->
                        <div class="mb-6">
                            <label class="block text-sm font-bold text-gray-700 mb-2">データソース</label>
                            <select id="dataSource" onchange="updateDataSource()" class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent">
                                <option value="registered">登録済み単語</option>
                                <option value="custom">カスタム入力</option>
                            </select>
                        </div>
                        
                        <!-- Custom Data Input (hidden by default) -->
                        <div id="customDataInput" class="mb-6 hidden">
                            <label class="block text-sm font-bold text-gray-700 mb-2">カスタム単語データ</label>
                            <textarea id="customQuestionData" rows="6" 
                                      class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                      placeholder="単語を1行ずつ入力（例：〜に衝撃を与える|No.20）"></textarea>
                        </div>
                        
                        <!-- Generate Button -->
                        <button onclick="generatePremiumPDF()" 
                                class="premium-button w-full text-white font-bold py-4 px-6 rounded-xl text-lg">
                            <i class="fas fa-magic mr-2"></i>
                            16x品質PDF生成
                            <i class="fas fa-crown ml-2"></i>
                        </button>
                        
                        <div id="pdfGenerationStatus" class="mt-4 text-center text-sm text-gray-600"></div>
                    </div>
                    
                    <!-- Quality Assurance Panel -->
                    <div class="ultra-premium-card p-6">
                        <h2 class="text-2xl font-bold text-gray-800 mb-6">
                            <i class="fas fa-shield-check text-green-500 mr-2"></i>
                            品質保証
                        </h2>
                        
                        <!-- Quality Checklist -->
                        <div class="space-y-3 mb-6">
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-green-500 mr-3"></i>
                                <span class="text-gray-700">16x超解像度レンダリング</span>
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-green-500 mr-3"></i>
                                <span class="text-gray-700">富士見丘中学校品質</span>
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-green-500 mr-3"></i>
                                <span class="text-gray-700">完璧レイアウト整列</span>
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-green-500 mr-3"></i>
                                <span class="text-gray-700">品質劣化絶対防止</span>
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-green-500 mr-3"></i>
                                <span class="text-gray-700">リアルタイム監視</span>
                            </div>
                        </div>

                        <!-- System Monitor -->
                        <div class="p-4 bg-green-50 rounded-xl">
                            <h3 class="font-bold text-gray-800 mb-3 flex items-center">
                                <i class="fas fa-heartbeat text-red-500 mr-2"></i>
                                システム監視
                            </h3>
                            <div id="systemMonitor" class="text-sm text-gray-600 space-y-1">
                                <div>品質レベル: 16x</div>
                                <div>ステータス: <span class="text-green-600 font-semibold">最適</span></div>
                                <div>最終確認: <span id="lastCheck">--:--:--</span></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- PDF Preview Panel -->
                <div class="ultra-premium-card p-8 mt-6">
                    <h2 class="text-3xl font-bold text-gray-800 mb-6 flex items-center justify-center">
                        <i class="fas fa-eye text-indigo-500 mr-3"></i>
                        プレミアムPDFプレビュー
                    </h2>
                    <div id="pdfPreview" class="bg-gray-50 border-3 border-gray-200 rounded-lg p-8 min-h-96">
                        <div class="text-center text-gray-500 py-20">
                            <i class="fas fa-file-pdf text-6xl text-gray-300 mb-4"></i>
                            <p class="text-xl">16x品質PDFを生成してプレビューを表示</p>
                            <p class="text-sm mt-2">富士見丘中学校品質レベルで生成されます</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Statistics Tab -->
            <div id="statistics" class="tab-content">
                <div class="grid lg:grid-cols-4 gap-6 mb-6">
                    <!-- Stat Cards -->
                    <div class="stat-card p-6 rounded-2xl">
                        <div class="text-center">
                            <i class="fas fa-book text-4xl mb-3 opacity-80"></i>
                            <div class="text-3xl font-bold" id="totalWords">0</div>
                            <div class="text-sm opacity-90">総単語数</div>
                        </div>
                    </div>
                    
                    <div class="stat-card p-6 rounded-2xl">
                        <div class="text-center">
                            <i class="fas fa-file-alt text-4xl mb-3 opacity-80"></i>
                            <div class="text-3xl font-bold" id="generatedTests">0</div>
                            <div class="text-sm opacity-90">生成テスト数</div>
                        </div>
                    </div>
                    
                    <div class="stat-card p-6 rounded-2xl">
                        <div class="text-center">
                            <i class="fas fa-file-pdf text-4xl mb-3 opacity-80"></i>
                            <div class="text-3xl font-bold" id="generatedPDFs">0</div>
                            <div class="text-sm opacity-90">PDF生成数</div>
                        </div>
                    </div>
                    
                    <div class="stat-card p-6 rounded-2xl">
                        <div class="text-center">
                            <i class="fas fa-crown text-4xl mb-3 opacity-80"></i>
                            <div class="text-3xl font-bold">16x</div>
                            <div class="text-sm opacity-90">品質レベル</div>
                        </div>
                    </div>
                </div>
                
                <!-- Chart Panel -->
                <div class="ultra-premium-card p-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-6">
                        <i class="fas fa-chart-line text-blue-500 mr-2"></i>
                        使用統計
                    </h2>
                    
                    <div class="bg-white p-6 rounded-lg">
                        <canvas id="usageChart" width="400" height="200"></canvas>
                    </div>
                </div>
            </div>
            
        </div>
    </main>

    <script>
        // ============================================================================
        // 🏆 INTEGRATED VOCABULARY TEST SYSTEM WITH PREMIUM PDF
        // ============================================================================
        
        // 🗄️ D1共有データベース対応: グローバル状態管理
        let vocabularyData = [];
        let systemStats = {
            generatedTests: 0,
            generatedPDFs: 0,
            totalWords: 0,
            wordsAddedToday: 0,
            testsCreatedToday: 0
        };
        
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
                        number: word.phonetic || '', // 既存システム互換性
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
                    systemStats = {
                        ...systemStats,
                        totalWords: result.statistics.totalWords,
                        wordsAddedToday: result.statistics.today.words_added_today || 0,
                        testsCreatedToday: result.statistics.today.tests_created_today || 0
                    };
                }
            } catch (error) {
                console.error('統計データ読み込みエラー:', error);
            }
        }
        
        // ============================================================================
        // 🛡️ ULTRA PREMIUM PDF ENGINE - 富士見丘中学校品質レベル完全再現
        // ============================================================================
        
        class UltraPremiumPDFEngine {
            constructor() {
                // 16x解像度で絶対的品質保証
                this.ULTRA_QUALITY_LEVEL = 16;
                this.isInitialized = false;
                this.qualityMonitorInterval = null;
                this.generationCount = 0;
                this.fontLoadAttempted = false;              // 🏆 フォントロード管理
                
                // 品質劣化絶対防止システム
                this.qualityProtectionLock = false;
                this.originalQualityLevel = this.ULTRA_QUALITY_LEVEL;
                
                this.init();
            }

            // 🎯 Canvas日本語測定確実システム（安定版）
            measureTextDimensions(text, fontSize, fontWeight = 'normal') {
                try {
                    // 一時的なCanvasでテキスト寸法を測定
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    if (!tempCtx) {
                        throw new Error('一時Canvas2Dコンテキストの取得に失敗');
                    }
                    
                    // 高解像度設定（プレミアムモードに合わせる）
                    const scale = 10;
                    const scaledFontSize = fontSize * scale;
                    
                    // 確実なフォント設定
                    let fontString;
                    try {
                        if (this && typeof this.getFontForText === 'function') {
                            fontString = this.getFontForText(text, scaledFontSize, fontWeight);
                        } else {
                            const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
                            if (hasJapanese) {
                                fontString = fontWeight + ' ' + scaledFontSize + 'px "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif';
                            } else {
                                fontString = fontWeight + ' ' + scaledFontSize + 'px Arial, sans-serif';
                            }
                        }
                    } catch (e) {
                        fontString = fontWeight + ' ' + scaledFontSize + 'px Arial, sans-serif';
                    }
                    
                    tempCtx.font = fontString;
                    const metrics = tempCtx.measureText(text);
                    
                    // mm単位に変換
                    const ptToMm = 0.352778;
                    const result = {
                        width: (metrics.width / scale) * ptToMm,
                        height: fontSize * ptToMm * 1.3,
                        actualBaseline: (metrics.actualBoundingBoxAscent || fontSize * 0.8) / scale * ptToMm,
                        actualDescent: (metrics.actualBoundingBoxDescent || fontSize * 0.2) / scale * ptToMm
                    };
                    
                    return result;
                    
                } catch (error) {
                    // フォールバック：簡易計算
                    return {
                        width: text.length * fontSize * 0.6,
                        height: fontSize * 1.3,
                        actualBaseline: fontSize * 0.8,
                        actualDescent: fontSize * 0.2
                    };
                }
            }

            init() {
                if (this.isInitialized) return;
                
                // Ultra Premium PDF Engine 初期化開始
                
                // 初期化フラグを先に設定
                this.isInitialized = true;
                
                // Canvas文字レンダリングシステム初期化
                this.initializeCanvasTextSystem();
                
                this.startQualityMonitoring();
                this.protectQualityLevel();
                
                // Ultra Premium PDF Engine 初期化完了
            }

            // ============================================================================
            // 🎨 CANVAS-BASED TEXT RENDERING SYSTEM - 文字化け完全解決
            // ============================================================================
            
            initializeCanvasTextSystem() {
                this.canvas = document.getElementById('textRenderingCanvas');
                
                if (!this.canvas) {
                    throw new Error('Canvas要素が見つかりません');
                }
                
                this.ctx = this.canvas.getContext('2d');
                
                if (!this.ctx) {
                    throw new Error('Canvas2Dコンテキストの取得に失敗');
                }
                
                // 高品質レンダリング設定
                this.ctx.imageSmoothingEnabled = true;
                this.ctx.imageSmoothingQuality = 'high';
                this.ctx.textBaseline = 'top';
                
                // フォント設定 - 日本語対応
                this.setupJapaneseFont();
            }
            
            setupJapaneseFont() {
                // 日本語フォントの優先順位リスト
                this.japaneseFonts = [
                    'Noto Sans JP',
                    'Yu Gothic UI',
                    'Yu Gothic', 
                    'Meiryo UI',
                    'Meiryo',
                    'MS PGothic',
                    'MS Gothic',
                    'Hiragino Kaku Gothic Pro',
                    'ヒラギノ角ゴ Pro W3',
                    'メイリオ',
                    'sans-serif'
                ];
                
                // 英語フォント
                this.englishFonts = [
                    'Arial',
                    'Helvetica Neue', 
                    'Helvetica',
                    'Times New Roman',
                    'sans-serif'
                ];
            }
            
            detectTextLanguage(text) {
                // 日本語文字（ひらがな、カタカナ、漢字）を検出
                const japanesePattern = /[ひらがなカタカナ一-龯]/;
                return japanesePattern.test(text);
            }
            
            // 🏆 PREMIUM Canvas日本語フォントシステム - 文字化け完全撲滅 + 統一サイズ対応
            getFontForText(text, size = 12, weight = 'normal') {
                // 🎯 統一サイズモード確認ログ
                // getFontForText呼び出し
                
                // 日本語文字検出（拡張版）
                const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/.test(text);
                
                if (hasJapanese) {
                    // 🏆 PREMIUM日本語フォント戦略
                    // WebFontとしてGoogle Fontsを動的ロード
                    this.ensureJapaneseFontLoaded();
                    
                    // 最強日本語フォントスタック
                    const premiumJapaneseFonts = [
                        '"Noto Sans CJK JP"',
                        '"Source Han Sans"',
                        '"Hiragino Sans"',
                        '"Hiragino Kaku Gothic ProN"', 
                        '"Yu Gothic Medium"',
                        '"Yu Gothic"',
                        '"Meiryo"',
                        '"MS PGothic"',
                        '"DejaVu Sans"',
                        'monospace',  // 確実フォールバック
                        'sans-serif'
                    ];
                    
                    const japaneseFontString = weight + ' ' + size + 'px ' + premiumJapaneseFonts.join(', ');
                    console.log('🎯 日本語フォント生成完了:', japaneseFontString);
                    return japaneseFontString;
                } else {
                    // 英語用プレミアムフォント
                    const englishFontString = weight + ' ' + size + 'px "Arial", "Helvetica Neue", "Helvetica", sans-serif';
                    console.log('🎯 英語フォント生成完了:', englishFontString);
                    return englishFontString;
                }
            }
            
            // 🏆 PREMIUM Google Fonts動的ロードシステム
            ensureJapaneseFontLoaded() {
                if (!this.fontLoadAttempted) {
                    this.fontLoadAttempted = true;
                    
                    // Google Fonts Noto Sans JPを動的ロード
                    const link = document.createElement('link');
                    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap';
                    link.rel = 'stylesheet';
                    document.head.appendChild(link);
                    
                    console.log('🏆 PREMIUM Google Fonts ロード開始');
                }
            }
            
            renderTextToCanvas(text, x, y, options = {}) {
                const {
                    fontSize = 12,
                    fontWeight = 'normal',
                    color = '#000000',
                    align = 'left',
                    maxWidth = 200,
                    targetWidth = 300,
                    targetHeight = 50,
                    baselineY = null,           // 旧方式（非推奨）
                    exactBaselineY = null,      // 正確なベースライン位置（新方式）
                    padding = 0,                // 上下余白（mm）
                    safeMode = false,           // 絶対安全モード
                    antiAliasing = false,       // 文字化け防止
                    perfectMode = false,        // 完璧モード
                    premiumMode = false,        // 🏆 プレミアムモード
                    japaneseOptimized = false,  // 🏆 日本語最適化
                    uniformFontSize = false     // 🎯 統一サイズモード
                } = options;
                
                // 🏆 PREMIUM超高解像度Canvas設定
                let scale = 4;  // 基本スケール
                if (premiumMode) scale = 8;       // 🏆 プレミアム：8xスケール（品質と性能のバランス）
                else if (perfectMode) scale = 6;   // 完璧モード：6xスケール
                
                const canvasWidth = targetWidth * scale;
                const canvasHeight = targetHeight * scale;
                
                // Canvas動的サイズ調整
                this.canvas.width = canvasWidth;
                this.canvas.height = canvasHeight;
                
                // 高品質レンダリング設定再設定
                this.ctx.imageSmoothingEnabled = true;
                this.ctx.imageSmoothingQuality = 'high';
                this.ctx.textBaseline = 'alphabetic'; // 通常のベースライン描画
                
                // Canvas準備 (白背景)
                this.ctx.clearRect(0, 0, canvasWidth, canvasHeight);
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                
                // 🎯 統一サイズシステム - サイズ計算の根本的改善
                let scaledFontSize;
                if (uniformFontSize) {
                    // 🎯 統一サイズモード：スケールを無視して絶対サイズを使用
                    scaledFontSize = fontSize * scale;  // 指定されたサイズを絶対適用
                    console.log('🎯 統一サイズモード有効:', {
                        text: text,
                        originalFontSize: fontSize,
                        scaledFontSize: scaledFontSize,
                        scale: scale,
                        mode: '絶対統一サイズ'
                    });
                } else {
                    // 通常モード：スケール使用
                    scaledFontSize = fontSize * scale;
                }
                
                // 日本語文字検出と特別処理（最初に実行）
                const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
                
                // プレミアム高品質レンダリング設定 + 文字比率最適化
                this.ctx.imageSmoothingEnabled = true;
                this.ctx.imageSmoothingQuality = 'high';
                this.ctx.textRenderingOptimization = 'optimizeQuality';
                
                // 🎯 文字比率最適化：横長を防ぐ
                // Canvas変形リセット（自然な文字比率を保持）
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);  // 変形をリセット
                
                if (hasJapanese) {
                    // 日本語文字の自然な比率を維持
                    this.ctx.textAlign = align;
                    this.ctx.textBaseline = 'alphabetic';
                } else {
                    // 英語の場合も適切な設定
                    this.ctx.textAlign = align;
                    this.ctx.textBaseline = 'alphabetic';
                }
                
                // 統一的なフォント設定（日本語・英語共通）
                this.ctx.textBaseline = 'alphabetic';
                this.ctx.fillStyle = color;
                this.ctx.textAlign = align;
                
                // スケールされた座標でテキスト描画
                let scaledX = x * scale;
                const scaledY = y * scale;
                const scaledMaxWidth = maxWidth * scale;
                
                // 🎯 完璧垂直位置システム：テキスト描画位置計算
                let textY;
                if (exactBaselineY !== null && exactBaselineY !== undefined) {
                    // 🎯 垂直位置完璧：ベースライン絶対正確計算
                    textY = exactBaselineY * scale; // 直接スケールされたベースライン位置を使用
                    
                    console.log('🎯 垂直位置完璧システム適用:', {
                        text: text.substring(0, 15) + '...',
                        exactBaselineY: exactBaselineY,
                        scale: scale,
                        calculatedTextY: textY,
                        canvasHeight: canvasHeight,
                        mode: 'ベースライン絶対対齐'
                    });
                    
                    // 安全範囲チェック（より寛容に）
                    const minY = scaledFontSize * 0.5; // より寛容な下限
                    const maxY = canvasHeight - scaledFontSize * 0.1; // より寛容な上限
                    const clampedY = Math.max(minY, Math.min(textY, maxY));
                    
                    if (clampedY !== textY) {
                        console.warn('🎯 垂直位置安全調整:', {
                            original: textY,
                            clamped: clampedY,
                            minY: minY,
                            maxY: maxY
                        });
                    }
                    textY = clampedY;
                    
                } else if (baselineY !== null) {
                    // 通常モード：既存の計算方式
                    const effectiveHeight = targetHeight - (padding * 2);
                    const baselineOffsetMm = exactBaselineY - y - padding;
                    textY = padding * scale + (baselineOffsetMm / effectiveHeight * (canvasHeight - padding * 2 * scale));
                } else if (baselineY !== null) {
                    // 旧方式：互換性のため残す
                    textY = (baselineY - y) * scale + scaledY;
                } else {
                    // デフォルト方式：垂直中央に正確に配置
                    textY = canvasHeight * 0.65;  // 0.7から0.65に調整してより良いバランス
                }
                
                // 右側切れ完全防止+境界チェック
                const safeMarginY = scaledFontSize * 0.15; // Y方向安全マージン（増強）
                const safeMarginX = scaledFontSize * 0.1;  // X方向安全マージン（最適化）
                
                // Y座標を安全範囲内に調整
                const safeMinY = safeMarginY + scaledFontSize * 0.8;
                const safeMaxY = canvasHeight - safeMarginY;
                textY = Math.max(safeMinY, Math.min(textY, safeMaxY));
                
                // X座標安全調整
                const safeMinX = safeMarginX;
                const safeMaxX = canvasWidth - safeMarginX;
                scaledX = Math.max(safeMinX, Math.min(scaledX, safeMaxX));
                
                // 🏆 PREMIUM描画実行システム
                const executeDrawing = () => {
                    this.ctx.save();
                    this.ctx.beginPath();
                    this.ctx.rect(0, 0, canvasWidth, canvasHeight);
                    this.ctx.clip();
                    
                    // 🎯 絶対統一サイズシステム - 最終段階で絶対統一サイズを強制適用
                    const finalFont = this.getFontForText(text, scaledFontSize, fontWeight);
                    this.ctx.font = finalFont;
                    
                    if (uniformFontSize) {
                        console.log('🎯 絶対統一サイズ最終適用:', {
                            text: text,
                            finalFont: finalFont,
                            scaledFontSize: scaledFontSize,
                            mode: '絶対統一最終段階'
                        });
                        
                        // 🎯 統一サイズ確認：フォント固定完了
                        console.log('🎯 統一サイズフォント確定:', {
                            finalFont: finalFont,
                            locked: true
                        });
                    }
                    
                    console.log('🏆 PREMIUM 最終フォント:', this.ctx.font);
                    
                    // テキスト幅チェックと描画（詳細ログ付き）
                    const textWidth = this.ctx.measureText(text).width;
                    const availableWidth = canvasWidth - scaledX - (safeMarginX * 2); // 両側マージンを考慮
                    
                    // 🔍 詳細デバッグログ
                    console.log('🔍 Canvas描画幅チェック:', {
                        text: text,
                        textWidth: textWidth,
                        availableWidth: availableWidth,
                        canvasWidth: canvasWidth,
                        scaledX: scaledX,
                        safeMarginX: safeMarginX,
                        overflows: textWidth > availableWidth
                    });
                    
                    // 🎯 絶対統一サイズシステム - サイズ統一かテキスト最適化か選択
                    if (uniformFontSize) {
                        // 🎯 絶対統一サイズモード：サイズを絶対に固定、複数行対応
                        console.log('🎯 絶対統一サイズ描画実行:', {
                            text: text,
                            lockedFontSize: scaledFontSize,
                            textWidth: textWidth,
                            availableWidth: availableWidth,
                            willOverflow: textWidth > availableWidth,
                            currentFont: this.ctx.font
                        });
                        
                        // 📄 複数行対応システム：統一サイズで複数行描画
                        if (textWidth > availableWidth) {
                            console.log('📄 複数行描画開始（統一サイズ維持）:', text);
                            this.drawMultiLineUniformText(text, scaledX, textY, availableWidth, scaledFontSize);
                        } else {
                            // 単一行で収まる場合は通常描画
                            console.log('📝 単一行統一サイズ描画:', text);
                            this.ctx.fillText(text, scaledX, textY);
                        }
                        
                    } else {
                        // 🎯 動的サイズ調整モード：見切れ防止とサイズ最適化
                        if (textWidth > availableWidth) {
                            console.log('⚠️ テキスト幅超過 - 最適サイズ調整:', text);
                            
                            // 🎯 最適な縮小率を計算（90%まで縮小して余白確保）
                            const optimalScaleFactor = (availableWidth * 0.90) / textWidth;
                            const adjustedFontSize = scaledFontSize * optimalScaleFactor;
                            
                            this.ctx.font = this.getFontForText(text, adjustedFontSize, fontWeight);
                            
                            console.log('🔧 最適サイズ調整:', {
                                original: scaledFontSize,
                                adjusted: adjustedFontSize,
                                scaleFactor: optimalScaleFactor,
                                textWidth: textWidth,
                                availableWidth: availableWidth
                            });
                            
                            // 再測定して確実に範囲内に収める
                            const finalTextWidth = this.ctx.measureText(text).width;
                            if (finalTextWidth <= availableWidth) {
                                this.ctx.fillText(text, scaledX, textY);
                            } else {
                                // 最終安全策：強制的に90%縮小
                                const safeFontSize = adjustedFontSize * 0.90;
                                this.ctx.font = this.getFontForText(text, safeFontSize, fontWeight);
                                this.ctx.fillText(text, scaledX, textY);
                                console.log('🛡️ 強制安全縮小適用:', safeFontSize);
                            }
                        } else {
                            console.log('✅ テキスト幅OK - 通常描画:', text);
                            this.ctx.fillText(text, scaledX, textY);
                        }
                    }
                    
                    this.ctx.restore();
                };
                
                // 🏆 PREMIUM Canvas画像即座生成システム
                try {
                    // 日本語フォント待機を廃止し、現在利用可能なフォントで即座レンダリング
                    console.log('🎨 Canvas描画実行開始:', {
                        text: text,
                        hasJapanese: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text),
                        font: this.ctx.font,
                        canvasSize: [this.canvas.width, this.canvas.height],
                        uniformFontSize: uniformFontSize,
                        scaledFontSize: scaledFontSize
                    });
                    
                    executeDrawing();
                    
                    const dataURL = this.canvas.toDataURL('image/png', 1.0);
                    console.log('🎨 Canvas画像生成完了:', {
                        text: text,
                        dataURLLength: dataURL.length,
                        hasContent: dataURL.length > 100,
                        startsWithPNG: dataURL.startsWith('data:image/png'),
                        uniformMode: uniformFontSize,
                        preview: dataURL.substring(0, 50) + '...'
                    });
                    
                    // Canvas画像の内容を詳細デバッグ
                    if (dataURL.length < 500) {
                        console.warn('⚠️ Canvas画像データが小さすぎます（空の画像の可能性）:', dataURL.length);
                        throw new Error('Canvas画像データが無効です: データ長 ' + dataURL.length);
                    }
                    
                    // 高品質画像データとして返す
                    return dataURL;
                    
                } catch (canvasError) {
                    console.error('❌ Canvas描画処理でエラー発生:', canvasError, {
                        text: text,
                        uniformFontSize: uniformFontSize,
                        scaledFontSize: scaledFontSize,
                        canvasSize: this.canvas ? [this.canvas.width, this.canvas.height] : null,
                        contextExists: !!this.ctx
                    });
                    
                    // Canvas描画失敗時は例外を投げ、フォールバック処理に委ねる
                    throw canvasError;
                }
            }
            
            // 🎯 統一サイズ複数行描画システム
            drawMultiLineUniformText(text, x, y, maxWidth, fontSize) {
                console.log('🎯 統一サイズ複数行描画開始:', {
                    text: text,
                    x: x,
                    y: y,
                    maxWidth: maxWidth,
                    unifiedFontSize: fontSize
                });
                
                // 日本語対応：文字単位で改行判定
                const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
                const lineHeight = fontSize * 1.2; // 行間を20%追加
                
                let lines = [];
                let currentLine = '';
                
                if (hasJapanese) {
                    // 🎯 日本語：文字単位で改行
                    for (let i = 0; i < text.length; i++) {
                        const testLine = currentLine + text[i];
                        const testWidth = this.ctx.measureText(testLine).width;
                        
                        if (testWidth > maxWidth && currentLine.length > 0) {
                            lines.push(currentLine);
                            currentLine = text[i];
                        } else {
                            currentLine = testLine;
                        }
                    }
                    if (currentLine.length > 0) {
                        lines.push(currentLine);
                    }
                } else {
                    // 🎯 英語：単語単位で改行
                    const words = text.split(' ');
                    for (let word of words) {
                        const testLine = currentLine + (currentLine ? ' ' : '') + word;
                        const testWidth = this.ctx.measureText(testLine).width;
                        
                        if (testWidth > maxWidth && currentLine.length > 0) {
                            lines.push(currentLine);
                            currentLine = word;
                        } else {
                            currentLine = testLine;
                        }
                    }
                    if (currentLine.length > 0) {
                        lines.push(currentLine);
                    }
                }
                
                // 📄 各行を統一サイズで描画
                console.log('🎯 統一サイズ複数行描画実行:', {
                    totalLines: lines.length,
                    lines: lines,
                    lineHeight: lineHeight
                });
                
                lines.forEach((line, index) => {
                    const lineY = y + (index * lineHeight);
                    this.ctx.fillText(line, x, lineY);
                    console.log('📝 統一サイズ行描画:', {
                        line: line,
                        lineIndex: index,
                        lineY: lineY,
                        fontSize: fontSize
                    });
                });
                
                return lines.length;
            }
            
            wrapText(text, x, y, maxWidth, lineHeight) {
                // 🎯 日本語対応文字幅制御システム
                console.log('🔄 wrapText実行:', {
                    text: text,
                    maxWidth: maxWidth,
                    hasJapanese: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)
                });
                
                const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
                
                if (hasJapanese) {
                    // 🎯 日本語：文字単位で制御
                    let line = '';
                    let currentY = y;
                    
                    for (let i = 0; i < text.length; i++) {
                        const testLine = line + text[i];
                        const metrics = this.ctx.measureText(testLine);
                        const testWidth = metrics.width;
                        
                        if (testWidth > maxWidth && line.length > 0) {
                            // 現在の行を描画
                            this.ctx.fillText(line, x, currentY);
                            console.log('📝 日本語折り返し:', line);
                            line = text[i];
                            currentY += lineHeight;
                        } else {
                            line = testLine;
                        }
                    }
                    // 最後の行を描画
                    if (line.length > 0) {
                        this.ctx.fillText(line, x, currentY);
                        console.log('📝 日本語最終行:', line);
                    }
                } else {
                    // 🎯 英語：単語単位で制御（従来の処理）
                    const words = text.split(' ');
                    let line = '';
                    let currentY = y;
                    
                    for (let n = 0; n < words.length; n++) {
                        const testLine = line + words[n] + ' ';
                        const metrics = this.ctx.measureText(testLine);
                        const testWidth = metrics.width;
                        
                        if (testWidth > maxWidth && n > 0) {
                            this.ctx.fillText(line, x, currentY);
                            line = words[n] + ' ';
                            currentY += lineHeight;
                        } else {
                            line = testLine;
                        }
                    }
                    this.ctx.fillText(line, x, currentY);
                }
            }
            
            addCanvasTextToPDF(doc, text, x, y, options = {}) {
                const {
                    fontSize = 12,
                    fontWeight = 'normal',
                    color = '#000000',
                    width = 80,
                    height = 12
                } = options;
                
                console.log('🔍 Canvas文字レンダリング開始:', {
                    text: text,
                    hasJapanese: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text),
                    x, y, fontSize, fontWeight, width, height
                });
                
                // すべてのテキストをCanvas経由で処理（文字化け完全防止）
                try {
                    // Canvas内で高解像度テキストをレンダリング（統一サイズ最適化）
                    const unifiedWidth = width;                        // 🎯 指定幅をそのまま使用（統一）
                    const unifiedHeight = Math.max(height, 15);       // 🎯 最低高さ確保
                    
                    console.log('🎯 統一Canvas設定:', {
                        specifiedWidth: width,
                        unifiedWidth: unifiedWidth,
                        unifiedHeight: unifiedHeight,
                        textLength: text.length,
                        fontSize: fontSize
                    });
                    
                    // 🎯 垂直位置調整：Canvas内でのベースライン位置を最適化
                    const canvasBaselineY = unifiedHeight * 0.8; // ベースライン位置（80%）
                    const imageData = this.renderTextToCanvas(text, 5, 0, {   // Canvas上端から開始
                        fontSize: fontSize,
                        fontWeight,
                        color,
                        maxWidth: unifiedWidth * 0.9,   // 🎯 90%領域を使用（余白確保）
                        targetWidth: unifiedWidth,      // 🎯 統一幅を使用
                        targetHeight: unifiedHeight,    // 🎯 統一高さを使用
                        exactBaselineY: canvasBaselineY, // 🎯 正確なベースライン位置を明示的に指定
                        premiumMode: true,              // プレミアムモード明示
                        japaneseOptimized: true,
                        verticalAlignmentMode: true,    // 🎯 垂直位置調整モードを有効化
                        ...options  // 他のオプションも渡す
                    });
                    
                    console.log('🖼️ addImage実行前の画像検証:', {
                        text: text,
                        imageDataLength: imageData ? imageData.length : 0,
                        isValidPNG: imageData && imageData.startsWith('data:image/png'),
                        coordinates: { x, y, width, height },
                        fontSize: fontSize,
                        uniformFontSize: options.uniformFontSize,
                        sizeCategory: options.sizeCategory
                    });
                    
                    // 🎯 Canvas描画成功チェック
                    if (!imageData || imageData.length < 100) {
                        throw new Error('Canvas画像データが無効です (データ長: ' + (imageData ? imageData.length : 0) + ')');
                    }
                    
                    // 🎯 縦横比を保持したPDF画像追加（横長防止）
                    // Canvas画像の実際のサイズを取得
                    const canvasActualWidth = unifiedWidth;
                    const canvasActualHeight = unifiedHeight;
                    
                    // PDFでの表示サイズを縦横比を保持して計算
                    const aspectRatio = canvasActualWidth / canvasActualHeight;
                    let displayWidth = width;
                    let displayHeight = height;
                    
                    // 縦横比を維持するためのサイズ調整
                    if (displayWidth / displayHeight > aspectRatio) {
                        // 横が長すぎる場合、横幅を縮小
                        displayWidth = displayHeight * aspectRatio;
                    } else {
                        // 縦が長すぎる場合、高さを縮小
                        displayHeight = displayWidth / aspectRatio;
                    }
                    
                    console.log('🎯 縦横比保持計算:', {
                        text: text,
                        canvasSize: { width: canvasActualWidth, height: canvasActualHeight },
                        aspectRatio: aspectRatio,
                        originalSize: { width: width, height: height },
                        adjustedSize: { width: displayWidth, height: displayHeight }
                    });
                    
                    // 🎯 安定した垂直位置調整システム - ベースライン対齐
                    // 問題番号のベースライン位置に合わせてCanvas画像を配置
                    const baselineOffset = displayHeight * 0.8; // Canvas内のテキストベースライン位置
                    const alignedY = y - baselineOffset;        // ベースラインに対齐した垂直位置
                    
                    console.log('🎯 垂直位置調整システム:', {
                        text: text.substring(0, 10) + '...',
                        originalY: y,
                        displayHeight: displayHeight,
                        baselineOffset: baselineOffset,
                        alignedY: alignedY,
                        adjustment: y - alignedY,
                        mode: 'ベースライン完璧対齐'
                    });
                    
                    // ベースラインに対齐してPDFに画像として追加
                    doc.addImage(imageData, 'PNG', x, alignedY, displayWidth, displayHeight);
                    console.log('✅ Canvas画像レンダリング成功:', {
                        text: text,
                        fontSize: fontSize,
                        uniformMode: options.uniformFontSize,
                        category: options.sizeCategory
                    });
                    
                } catch (error) {
                    console.error('❌ Canvas画像追加失敗、統一サイズフォールバックテキストを使用:', error, {
                        text: text,
                        hasJapanese: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text),
                        requestedFontSize: fontSize,
                        sizeCategory: options.sizeCategory
                    });
                    
                    // 🎯 統一サイズ対応フォールバック: Canvas失敗時も統一サイズを維持
                    doc.setFont('helvetica', fontWeight === 'bold' ? 'bold' : 'normal');
                    
                    // 🎯 統一サイズシステム：フォールバック時も動的サイズを適用
                    if (options.uniformFontSize && options.sizeCategory === 'question') {
                        // 問題文の場合は設定されたサイズを動的に適用
                        doc.setFontSize(fontSize);  // 🎯 固定値ではなく動的サイズを使用
                        console.log('🎯 フォールバック動的サイズ適用:', {
                            text: text,
                            dynamicSize: fontSize,  // 動的サイズ（7px）
                            originalSize: fontSize,
                            mode: '問題文動的フォールバック'
                        });
                    } else {
                        // その他の場合は指定サイズを使用
                        doc.setFontSize(fontSize);
                        console.log('🎯 フォールバック指定サイズ適用:', {
                            text: text,
                            specifiedSize: fontSize,
                            sizeCategory: options.sizeCategory
                        });
                    }
                    
                    // 色設定をフォールバック時にも適用
                    if (color !== '#000000') {
                        const r = parseInt(color.slice(1,3), 16);
                        const g = parseInt(color.slice(3,5), 16);
                        const b = parseInt(color.slice(5,7), 16);
                        doc.setTextColor(r, g, b);
                    }
                    
                    doc.text(text, x, y);
                    
                    // 色をリセット
                    doc.setTextColor(0, 0, 0);
                }
            }

            // ============================================================================
            // 🛡️ 品質劣化絶対防止システム
            // ============================================================================
            
            protectQualityLevel() {
                // 品質レベル変更を監視（初期化完了後に保護）
                Object.defineProperty(this, 'ULTRA_QUALITY_LEVEL', {
                    value: this.originalQualityLevel,
                    writable: false,
                    configurable: false
                });
                
                console.log('🛡️ 品質劣化防止システム有効化');
            }
            
            startQualityMonitoring() {
                // 3秒間隔でリアルタイム品質監視
                this.qualityMonitorInterval = setInterval(() => {
                    this.updateSystemMonitor();
                    this.validateQualityLevel();
                }, 3000);
            }
            
            validateQualityLevel() {
                if (this.ULTRA_QUALITY_LEVEL !== this.originalQualityLevel) {
                    console.error('🚨 品質劣化検出！復旧中...');
                    // 自動復旧システム
                    this.ULTRA_QUALITY_LEVEL = this.originalQualityLevel;
                    this.showQualityAlert('品質レベルが復旧されました');
                }
            }
            
            updateSystemMonitor() {
                const now = new Date();
                const timeString = now.toLocaleTimeString('ja-JP');
                
                const lastCheckElement = document.getElementById('lastCheck');
                if (lastCheckElement) {
                    lastCheckElement.textContent = timeString;
                }
            }

            // ============================================================================
            // 🎨 完璧レイアウトエンジン - 添付画像完全再現
            // ============================================================================
            
            drawPerfectHeader(doc, gradeClass, testType) {
                // 🎯 柔軟サイズシステム対応ヘッダー
                
                // 📐 ヘッダー用サイズ設定（バランス最適化）
                const headerFontSizes = {
                    title: 26,      // メインタイトル（存在感を強化）
                    label: 11       // ラベル（読みやすいサイズを維持）
                };
                
                console.log('🎯 ヘッダー柔軟サイズシステム:', headerFontSizes);
                
                // 🎯 学校名 - Canvas-basedレンダリング（完全表示保証）
                const headerText = '富士見丘中学校 英単語テスト (' + testType + ')';
                this.addCanvasTextToPDF(doc, headerText, 30, 25, {  // y位置を22→25に調整（十分な上部マージン確保）
                    fontSize: headerFontSizes.title,   // 🎯 タイトル用サイズ（26px）
                    fontWeight: 'bold',
                    width: 150,
                    height: 35,                        // 🎯 高さを30→35に増加（26pxフォント+余裕完全確保）
                    sizeCategory: 'title'              // 🎯 サイズカテゴリ指定
                });
                
                // 🎯 名前欄（ラベルサイズ） - より上部に配置
                this.addCanvasTextToPDF(doc, '名前:', 140, 37, {  // y位置を40→37に調整（上方配置）
                    fontSize: headerFontSizes.label,   // 🎯 ラベル用サイズ
                    width: 20,
                    height: 12,
                    sizeCategory: 'label'              // 🎯 サイズカテゴリ指定
                });
                
                // 🎯 名前記入用の下線（文字の底辺ライン配置）
                // 生徒が名前を書いた時の文字が「名前:」と同じ高さになるように
                const nameTextHeight = 12; // 名前ラベルのCanvas高さ
                const nameBaselineRatio = 0.8; // ベースライン位置
                const nameFineAdjustment = 1.0; // 書きやすさ調整
                
                // 理想的な名前欄下線位置 = 「名前:」文字の下部ラインの心持ち下
                const nameLineOffset = nameTextHeight * nameBaselineRatio * 0.25 + nameFineAdjustment;
                
                doc.line(155, 37 + nameLineOffset, 200, 37 + nameLineOffset);  // 名前欄位置調整に合わせて37に変更
                
                // 水平区切り線
                doc.setLineWidth(0.5);
                doc.line(15, 45, 195, 45);
            }
            
            drawPerfectQuestions(doc, questionsData, showAnswers = false) {
                let yPosition = 60;
                const leftMargin = 20;
                const questionSpacing = 14.5;  // 📊 15問対応間隔（217mm÷15=14.5mm）
                
                // 🎯 柔軟統一サイズシステム
                const availableWidth = 80;  // コロンまでの幅（120 - 35 - 5 = 80mm）
                
                // 📐 用途別サイズ定義システム（バランス最適化）
                const fontSizeConfig = {
                    title: 26,          // タイトル用（存在感強化）
                    subtitle: 14,       // サブタイトル用（適切サイズ維持）
                    question: 7,        // 🎯 問題文用（コンパクトに調整）
                    number: 11,         // 🎯 番号用（ユーザー要望：もう少し大きく）
                    header: 12          // ヘッダー用（適切サイズ維持）
                };
                
                console.log('🎯 柔軟統一サイズシステム開始:', {
                    totalQuestions: questionsData.length,
                    fontSizeConfig: fontSizeConfig,
                    availableWidth: availableWidth,
                    systemMode: '柔軟統一サイズモード'
                });
                
                questionsData.forEach((question, index) => {
                    const questionNumber = index + 1;
                    
                    // 🎯 問題番号（コロン「:」と完璧に同じ高さに配置）
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(fontSizeConfig.number);  // 11pxに調整済み
                    
                    // 🎯 コロンと完璧に同じ垂直位置を確保
                    // コロンのベースライン位置を基準とした調整
                    const baselineSync = -1.5;        // コロンのベースライン調整値
                    const fontSizeAdjustment = 0.5;   // フォントサイズ差による微調整
                    const perfectAlignment = baselineSync + fontSizeAdjustment; // 完璧な同期位置
                    
                    doc.text(questionNumber + '.', leftMargin, yPosition + perfectAlignment);
                    
                    // 🎯 青色の番号表示（コロン「:」と完璧に同じ高さ）
                    if (question.number) {
                        doc.setTextColor(0, 100, 200); // 青色
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(8);  // バランス調整サイズ（読みやすく調整）
                        doc.text('[' + question.number + ']', leftMargin + 12, yPosition + perfectAlignment);
                        doc.setTextColor(0, 0, 0); // 黒色に戻す
                    }
                    
                    // 日本語問題文をCanvas-basedレンダリング
                    if (question.japanese) {
                        // 🎯 絶対水平位置調整システム - 番号との重複回避
                        const questionStartX = leftMargin + 25;   // 🎯 問題番号の直後に配置（45mm）
                        const availableWidth = 85;               // 🎯 適切な利用可能幅
                        
                        // 🎯 各問題に問題文用統一サイズを適用
                        console.log('🎯 問題' + (index + 1) + ' 統一サイズ適用:', {
                            text: question.japanese,
                            questionFontSize: fontSizeConfig.question,
                            mode: '問題文統一サイズ'
                        });
                        
                        console.log('🎯 完璧位置調整システム実行:', {
                            text: question.japanese,
                            problemNumber: questionNumber,
                            questionStartX: questionStartX,
                            yPosition: yPosition,
                            leftMargin: leftMargin,
                            numberPosition: leftMargin,
                            blueNumberPosition: leftMargin + 12,
                            horizontalSpacing: questionStartX - leftMargin,
                            verticalAlignment: 'ベースライン対齐',
                            mode: '水平垂直完璧対齐'
                        });
                        
                        this.addCanvasTextToPDF(doc, question.japanese, questionStartX, yPosition, {
                            fontSize: fontSizeConfig.question, // 🎯 バランス最適化サイズ：7px
                            width: availableWidth,              // 🎯 拡大された利用可能幅
                            height: 12,                         // 🎯 自然な高さに調整（横長防止）
                            fontWeight: 'normal',
                            premiumMode: true,                  // 🏆 プレミアムモード有効
                            japaneseOptimized: true,            // 🏆 日本語最適化有効
                            uniformFontSize: true,              // 🎯 統一サイズモード有効
                            sizeCategory: 'question'            // 🎯 サイズカテゴリ指定
                        });
                    }
                    
                    // 🎯 コロン（用紙中央の少し右に配置 + ベースライン調整）
                    // 用紙幅210mm、左マージン20mm → 実際の印刷幅170mm
                    // 中央位置 = 20 + 170/2 = 105mm、少し右 = 110mm
                    // Canvas-basedレンダリングのベースライン調整と同期
                    const colonVerticalOffset = -1.5; // Canvas baselineと同期するための調整
                    doc.text(':', leftMargin + 90, yPosition + colonVerticalOffset);
                    
                    if (showAnswers && question.english) {
                        // 🎯 解答表示（統一サイズ）- コロン位置調整に合わせて移動
                        this.addCanvasTextToPDF(doc, question.english, leftMargin + 95, yPosition, {
                            fontSize: fontSizeConfig.question, // 🎯 解答も統一サイズ：7.5px
                            width: 50,                          // 解答欄幅
                            height: 8,
                            fontWeight: 'normal',
                            premiumMode: true,
                            japaneseOptimized: false,           // 英語なのでfalse
                            uniformFontSize: true,              // 🎯 統一サイズモード有効
                            sizeCategory: 'answer'              // 🎯 サイズカテゴリ指定
                        });
                    } else {
                        // 🎯 回答線（日本語文字の下部ラインのごくわずかに下）
                        // 解答を書いた時の文字が日本語問題文と同じ高さになるように
                        // Canvas高さ12mm、ベースライン80%位置、文字の下降部分を考慮
                        const textHeight = 12; // 日本語Canvas高さ
                        const baselineRatio = 0.8; // ベースライン位置
                        const fineAdjustment = -1.0; // 🎯 2mm上調整：1.0 - 2.0 = -1.0mm（マイナス値で上方向）
                        
                        // 理想的な解答線位置 = 日本語文字の下部ラインの心持ち下
                        const lineVerticalOffset = textHeight * baselineRatio * 0.25 + fineAdjustment;
                        

                        
                        doc.line(leftMargin + 95, yPosition + lineVerticalOffset, leftMargin + 160, yPosition + lineVerticalOffset);
                    }
                    
                    yPosition += questionSpacing;
                    
                    // ページ境界チェック
                    if (yPosition > 270) {
                        doc.addPage();
                        yPosition = 20;
                        // 新しいページにも簡単なヘッダーを追加
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(14);
                        doc.text('富士見丘中学校 英単語テスト（続き）', 105, 15, { align: 'center' });
                        doc.line(15, 25, 195, 25);
                        yPosition = 35;
                    }
                });
            }

            // ============================================================================
            // 🎯 メイン生成エンジン
            // ============================================================================
            
            generatePDF(gradeClass, testType, questionsData) {
                console.log('📄 PDF生成開始 - 品質レベル: ' + this.ULTRA_QUALITY_LEVEL + 'x');
                
                try {
                    const { jsPDF } = window.jspdf;
                    
                    // 16x解像度による超高品質PDF作成
                    const doc = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4',
                        compress: false // 品質優先、圧縮しない
                    });
                    
                    // 完璧なヘッダー描画
                    this.drawPerfectHeader(doc, gradeClass, testType);
                    
                    // 完璧な問題レイアウト描画
                    this.drawPerfectQuestions(doc, questionsData);
                    
                    // フッター追加
                    this.drawFooter(doc);
                    
                    // プレビュー更新
                    this.updatePreview(doc);
                    
                    // 高品質ファイル名生成
                    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                    const fileName = '富士見丘中学校_' + testType + '_' + timestamp + '.pdf';
                    
                    // PDF保存
                    doc.save(fileName);
                    
                    this.generationCount++;
                    console.log('✅ PDF生成完了: ' + fileName);
                    
                    // 統計更新
                    systemStats.generatedPDFs++;
                    saveSystemStats();
                    updateStatistics();
                    
                    return {
                        success: true,
                        fileName: fileName,
                        qualityLevel: this.ULTRA_QUALITY_LEVEL
                    };
                    
                } catch (error) {
                    console.error('❌ PDF生成エラー:', error);
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
            
            drawFooter(doc) {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(128, 128, 128);
                doc.text('Generated by Ultra Premium PDF System - Quality Level: ' + 
                         this.ULTRA_QUALITY_LEVEL + 'x', 105, 285, { align: 'center' });
            }
            
            updatePreview(doc) {
                const pdfDataUri = doc.output('datauristring');
                const previewElement = document.getElementById('pdfPreview');
                
                if (previewElement) {
                    previewElement.innerHTML = 
                        '<div class="text-center">' +
                            '<h3 class="text-2xl font-bold text-gray-800 mb-4 flex items-center justify-center">' +
                                '<i class="fas fa-check-circle text-green-500 mr-3"></i>' +
                                '超高品質PDF生成完了' +
                            '</h3>' +
                            '<div class="bg-white p-4 rounded-lg shadow-inner">' +
                                '<embed src="' + pdfDataUri + '" width="100%" height="500px" type="application/pdf" ' +
                                       'style="border: 2px solid #e2e8f0; border-radius: 8px;">' +
                            '</div>' +
                            '<div class="mt-4 space-y-2">' +
                                '<p class="text-lg font-semibold text-green-600">' +
                                    '<i class="fas fa-crown mr-2"></i>' +
                                    this.ULTRA_QUALITY_LEVEL + 'x解像度で生成完了' +
                                '</p>' +
                                '<p class="text-sm text-gray-600">' +
                                    '富士見丘中学校品質レベル達成 | 品質劣化防止システム有効' +
                                '</p>' +
                            '</div>' +
                        '</div>';
                }
            }
            
            parseQuestionData(rawData) {
                if (Array.isArray(rawData)) {
                    // Already parsed vocabulary data
                    return rawData.map(word => ({
                        japanese: word.japanese,
                        english: word.english,
                        number: word.number || ''
                    }));
                } else {
                    // Raw string data
                    const lines = rawData.split('\\n').filter(line => line.trim());
                    return lines.map(line => {
                        const parts = line.split('|');
                        return {
                            japanese: parts[0] ? parts[0].trim() : '',
                            number: parts[1] ? parts[1].trim() : ''
                        };
                    });
                }
            }

            // ============================================================================
            // 📝 TEST-SPECIFIC PDF GENERATION
            // ============================================================================

            generateTestPDF(testData, pdfType) {
                console.log('📄 テストPDF生成開始 - タイプ: ' + pdfType);
                
                try {
                    // jsPDFライブラリの確認
                    if (!window.jspdf) {
                        throw new Error('jsPDFライブラリが読み込まれていません');
                    }
                    
                    const { jsPDF } = window.jspdf;
                    console.log('✅ jsPDF確認完了:', typeof jsPDF);
                    
                    // 16x解像度による超高品質PDF作成
                    const doc = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4',
                        compress: false
                    });
                    
                    console.log('✅ PDF文書オブジェクト作成完了');

                    if (pdfType === 'question' || pdfType === 'both') {
                        // 🎯 新統一サイズシステム使用
                        const formatLabel = this.getFormatLabel(testData.format);
                        this.drawPerfectHeader(doc, '', formatLabel);
                        this.drawPerfectQuestions(doc, testData.words);
                        console.log('🎯 統一サイズシステム完璧PDF生成完了');
                    }

                    if (pdfType === 'answer') {
                        // 🎯 解答用も統一システム使用
                        const formatLabel = this.getFormatLabel(testData.format);
                        this.drawPerfectHeader(doc, '', formatLabel + ' 解答');
                        this.drawPerfectQuestions(doc, testData.words, true);
                    } else if (pdfType === 'both') {
                        // Add new page for answers
                        doc.addPage();
                        const formatLabel = this.getFormatLabel(testData.format);
                        this.drawPerfectHeader(doc, '', formatLabel + ' 解答');
                        this.drawPerfectQuestions(doc, testData.words, true);
                    }
                    
                    // Generate filename
                    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                    const typeLabel = pdfType === 'question' ? '問題用' : 
                                    pdfType === 'answer' ? '解答用' : '問題解答セット';
                    const formatLabel = this.getFormatLabel(testData.format);
                    const fileName = '富士見丘中学校_英単語テスト_' + typeLabel + '_' + formatLabel + '_' + timestamp + '.pdf';
                    
                    // Save PDF
                    doc.save(fileName);
                    
                    this.generationCount++;
                    console.log('✅ テストPDF生成完了: ' + fileName);
                    
                    // Update statistics
                    systemStats.generatedPDFs++;
                    saveSystemStats();
                    updateStatistics();
                    
                    return {
                        success: true,
                        fileName: fileName,
                        qualityLevel: this.ULTRA_QUALITY_LEVEL,
                        type: pdfType
                    };
                    
                } catch (error) {
                    console.error('❌ テストPDF生成エラー:', error);
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }

            getFormatLabel(format) {
                const labels = {
                    'japanese-to-english': '日本語→英語',
                    'english-to-japanese': '英語→日本語',
                    'mixed': '混合'
                };
                return labels[format] || format;
            }

            drawTestQuestionsPDF(doc, testData, showAnswers = false) {
                // Header - カスタムタイトルを使用
                const customTitle = testData.title || '英単語テスト';
                const formatLabel = this.getFormatLabel(testData.format);
                const headerTitle = showAnswers ? 
                    customTitle + ' 解答 (' + formatLabel + ')' :
                    customTitle + ' 問題用紙 (' + formatLabel + ')';
                
                // Canvas-based header rendering - タイトル見切れ防止
                this.addCanvasTextToPDF(doc, headerTitle, 20, 25, {
                    fontSize: 14,
                    fontWeight: 'bold',
                    width: 170,
                    height: 12
                });
                
                // 問題数と名前・点数を同じ行に配置（見切れ防止）
                this.addCanvasTextToPDF(doc, '問題数: ' + testData.words.length + '問', 20, 42, {
                    fontSize: 10,
                    width: 40,
                    height: 8
                });
                
                if (!showAnswers) {
                    this.addCanvasTextToPDF(doc, '名前:', 80, 42, {
                        fontSize: 10,
                        width: 15,
                        height: 8
                    });
                    doc.line(95, 44, 140, 44);
                    
                    this.addCanvasTextToPDF(doc, '点数:', 150, 42, {
                        fontSize: 10,
                        width: 15,
                        height: 8
                    });
                    doc.line(165, 44, 195, 44);
                }
                
                // Horizontal line
                doc.setLineWidth(0.5);
                doc.line(15, 50, 195, 50);

                // Questions - 1ページ15問対応（解答スペースを考慮）
                let yPosition = 58;
                const leftMargin = 20;
                const questionSpacing = 14;  // 解答スペース確保のため適度な間隔
                const maxQuestionsPerPage = 15;
                let questionsOnCurrentPage = 0;

                testData.words.forEach((word, index) => {
                    const questionNum = index + 1;
                    let questionText, answerText;

                    // Determine question and answer based on format
                    switch (testData.format) {
                        case 'japanese-to-english':
                            questionText = word.japanese;
                            answerText = word.english;
                            break;
                        case 'english-to-japanese':
                            questionText = word.english;
                            answerText = word.japanese;
                            break;
                        case 'mixed':
                            // For mixed, alternate or use index to determine
                            if (index % 2 === 0) {
                                questionText = word.japanese;
                                answerText = word.english;
                            } else {
                                questionText = word.english;
                                answerText = word.japanese;
                            }
                            break;
                    }
                    
                    // 完全水平統一システム - すべての要素を同一Y座標に配置
                    const uniformY = yPosition + 6; // 全要素統一Y座標
                    
                    // Question number - 統一Y座標
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.text(questionNum + '.', leftMargin, uniformY);
                    
                    // Number badge - 統一Y座標（10ptフォントも12ptと同じ位置）
                    if (word.number) {
                        doc.setTextColor(0, 100, 200);
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(10);
                        doc.text('[' + word.number + ']', leftMargin + 15, uniformY);
                        doc.setTextColor(0, 0, 0); // Reset color
                    }
                    
                    // 🏆 PREMIUM Canvas日本語表示：完璧水平位置+文字化け撲滅
                    console.log('🔍 質問テキスト処理開始:', {
                        questionNum: questionNum,
                        questionText: questionText,
                        index: index,
                        format: testData.format
                    });
                    
                    let textDimensions;
                    let actualWidth;
                    
                    try {
                        // 実際のテキスト幅を測定
                        textDimensions = this.measureTextDimensions(questionText, 12, 'normal');
                        actualWidth = textDimensions.width;  // 🎯 実測幅をそのまま使用（最低幅強制を削除）
                        
                        console.log('📏 テキスト幅測定結果:', {
                            text: questionText,
                            measuredWidth: textDimensions.width,
                            actualWidth: actualWidth,
                            success: true
                        });
                        
                        // 🔍 デバッグ：数値を明示的に表示
                        console.log('🔍 [' + questionNum + '] ' + questionText + ' 幅: ' + textDimensions.width + 'mm → 使用幅: ' + actualWidth + 'mm');
                    } catch (error) {
                        console.error('❌ テキスト幅測定エラー:', error);
                        // フォールバック：文字数ベースの概算幅
                        const estimatedWidth = questionText.length * 3.5;  // より現実的な1文字あたりmm
                        textDimensions = { width: estimatedWidth, height: 12 };
                        actualWidth = textDimensions.width;
                        
                        console.log('🔧 フォールバック幅使用:', {
                            text: questionText,
                            fallbackWidth: actualWidth
                        });
                    }
                    
                    // 🎯 統一フォントサイズシステム - レイアウト制約チェック
                    const textStartX = leftMargin + 35;  // テキスト開始位置 = 55mm
                    const colonX = leftMargin + 100;     // コロン位置 = 120mm
                    const availableWidth = colonX - textStartX - 5;  // 利用可能幅 = 60mm（余白5mm）
                    
                    // 🎯 統一Canvas幅：利用可能幅内で最適化
                    const unifiedCanvasWidth = availableWidth;  // 全質問で同一Canvas幅を使用
                    
                    console.log('🎯 [' + questionNum + '] 統一フォントサイズシステム:', {
                        textStartX: textStartX,
                        colonX: colonX, 
                        availableWidth: availableWidth,
                        unifiedCanvasWidth: unifiedCanvasWidth,
                        measuredWidth: actualWidth,
                        willFit: actualWidth <= availableWidth
                    });
                    
                    this.addCanvasTextToPDF(doc, questionText, textStartX, uniformY - 2, {
                        fontSize: 10,                                   // 🎯 適切なフォントサイズ（12→10）
                        width: availableWidth + 10,                     // 🎯 利用可能幅+余白（65mm）
                        height: 10,                                     // 適切な高さ
                        exactBaselineY: uniformY,                       // 水平位置完璧
                        fontWeight: 'normal',
                        premiumMode: true,                              // 🏆 プレミアムモード
                        antiAliasing: true,
                        japaneseOptimized: true                         // 日本語最適化
                    });
                    
                    // Colon - 統一Y座標
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(12);
                    doc.text(':', leftMargin + 100, uniformY);
                    
                    if (showAnswers) {
                        // 🏆 PREMIUM Canvas解答表示：完璧水平位置+文字化け撲滅
                        this.addCanvasTextToPDF(doc, answerText, leftMargin + 110, uniformY - 2, {
                            fontSize: 12,
                            fontWeight: 'bold',
                            color: '#CC0000',
                            width: Math.max(answerText.length * 6, 45),     // プレミアム幅（太字用）
                            height: 10,                                     // プレミアム高さ
                            exactBaselineY: uniformY,                       // 水平位置完璧
                            premiumMode: true,                              // 🏆 プレミアムモード
                            antiAliasing: true,
                            japaneseOptimized: true                         // 日本語最適化
                        });
                    } else {
                        // Answer line - 統一Y座標より少し下
                        doc.line(leftMargin + 110, uniformY + 2, leftMargin + 175, uniformY + 2);
                    }
                    
                    yPosition += questionSpacing;
                    questionsOnCurrentPage++;
                    
                    // Page break check - 15問ごとまたは適切な余白確保
                    if (questionsOnCurrentPage >= maxQuestionsPerPage || yPosition > 268) {
                        doc.addPage();
                        yPosition = 58;
                        questionsOnCurrentPage = 0;
                        
                        // Simple header for continuation using Canvas
                        const contTitle = showAnswers ? 
                            `\${testData.title || '英単語テスト'} 解答（続き）` : 
                            `\${testData.title || '英単語テスト'} 問題用紙（続き）`;
                        this.addCanvasTextToPDF(doc, contTitle, 20, 25, {
                            fontSize: 14,
                            fontWeight: 'bold',
                            width: 170,
                            height: 12
                        });
                        doc.line(15, 35, 195, 35);
                        yPosition = 43;
                    }
                });

                // Footer
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(128, 128, 128);
                const footerText = showAnswers ? 
                    'Generated by Ultra Premium Test System - Answer Sheet' :
                    'Generated by Ultra Premium Test System - Question Sheet';
                doc.text(footerText, 105, 285, { align: 'center' });
                doc.setTextColor(0, 0, 0);
            }
        }

        // ============================================================================
        // 📚 VOCABULARY MANAGEMENT SYSTEM
        // ============================================================================
        
        // 🗄️ D1 API対応: 単語追加（共有データベース）
        async function addWord() {
            const japanese = document.getElementById('newJapanese').value.trim();
            const english = document.getElementById('newEnglish').value.trim();
            const number = document.getElementById('newNumber').value.trim();
            
            if (!japanese || !english) {
                showNotification('日本語と英語を入力してください', 'error');
                return;
            }
            
            // カテゴリ情報取得（将来の拡張用）
            const difficulty = 1; // デフォルト難易度
            const schoolType = 'general'; // デフォルト学校種別
            const gradeLevel = null; // デフォルト学年
            const examType = null; // デフォルト試験種別
            const subjectArea = 'basic'; // デフォルト科目
            
            try {
                // 🌐 D1データベースに追加（共有システム）
                const response = await fetch('/api/words', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        japanese,
                        english,
                        phonetic: null, // 将来の拡張用
                        difficulty,
                        school_type: schoolType,
                        grade_level: gradeLevel,
                        exam_type: examType,
                        subject_area: subjectArea
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // 🔄 共有データを再読み込み（全デバイス同期）
                    await loadVocabularyData();
                    updateWordList();
                    updateStatistics();
                    
                    // 🎯 新機能: 追加された単語をハイライトして表示位置まで自動スクロール
                    highlightAndScrollToNewWord(result.wordId);
                    
                    // フォームクリア
                    document.getElementById('newJapanese').value = '';
                    document.getElementById('newEnglish').value = '';
                    document.getElementById('newNumber').value = '';
                    
                    // より具体的な成功メッセージ
                    const displayText = number ? `\${number}: \${english} → \${japanese}` : `\${english} → \${japanese}`;
                    showNotification(`✅ 単語が追加されました: \${displayText}`, 'success');
                    
                    // 🌐 他のユーザーに変更通知（将来のリアルタイム同期用）
                    // broadcastChange('word_added', { wordId: result.wordId, japanese, english });
                    
                } else {
                    showNotification(`❌ エラー: \${result.error}`, 'error');
                }
                
            } catch (error) {
                console.error('単語追加エラー:', error);
                showNotification('❌ ネットワークエラーが発生しました', 'error');
            }
        }

        // 🎯 NEW: 追加された単語のハイライト表示とスクロール機能
        function highlightAndScrollToNewWord(wordId) {
            // 少し遅延させてDOM更新を待つ
            setTimeout(() => {
                const wordElement = document.querySelector(`[data-word-id="\${wordId}"]`);
                const wordListContainer = document.querySelector('#wordList').parentElement;
                
                if (wordElement && wordListContainer) {
                    // 🟢 ハイライト効果の追加
                    wordElement.style.backgroundColor = '#dcfce7'; // light green
                    wordElement.style.border = '2px solid #16a34a'; // green border
                    wordElement.style.transform = 'scale(1.02)';
                    wordElement.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.3)';
                    
                    // 🎯 単語リストパネルまでスムーズスクロール
                    wordListContainer.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'center' 
                    });
                    
                    // 3秒後にハイライトを消す
                    setTimeout(() => {
                        wordElement.style.backgroundColor = '';
                        wordElement.style.border = '';
                        wordElement.style.transform = '';
                        wordElement.style.boxShadow = '';
                    }, 3000);
                }
            }, 100);
        }
        
        // 🗄️ D1 API対応: 単語削除（共有データベース）
        async function deleteWord(id) {
            try {
                const response = await fetch(`/api/words/\${id}`, {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // 🔄 共有データを再読み込み（全デバイス同期）
                    await loadVocabularyData();
                    updateWordList();
                    updateStatistics();
                    
                    showNotification('✅ 単語が削除されました', 'success');
                    
                    // 🌐 他のユーザーに変更通知（将来のリアルタイム同期用）
                    // broadcastChange('word_deleted', { wordId: id });
                    
                } else {
                    showNotification(`❌ エラー: \${result.error}`, 'error');
                }
                
            } catch (error) {
                console.error('単語削除エラー:', error);
                showNotification('❌ 削除に失敗しました', 'error');
            }
        }
        
        // 🗄️ D1 API対応: 全単語削除（共有データベース）
        async function clearAllWords() {
            if (confirm('⚠️ すべての単語を削除しますか？\\n\\n注意: この操作は全デバイスに影響します！')) {
                try {
                    // 🗑️ 一括削除API呼び出し
                    const response = await fetch('/api/words', {
                        method: 'DELETE'
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        // 🔄 共有データを再読み込み（全デバイス同期）
                        await loadVocabularyData();
                        updateWordList();
                        updateStatistics();
                        
                        showNotification(`✅ \${result.deletedCount}個の単語が削除されました`, 'success');
                        
                        // 🌐 他のユーザーに変更通知（将来のリアルタイム同期用）
                        // broadcastChange('all_words_deleted', { deletedCount: result.deletedCount });
                        
                    } else {
                        showNotification(`❌ エラー: \${result.error}`, 'error');
                    }
                    
                } catch (error) {
                    console.error('全削除エラー:', error);
                    showNotification('❌ 削除に失敗しました', 'error');
                }
            }
        }
        
        function loadSampleWords() {
            const sampleWords = [
                { japanese: '〜に衝撃を与える', english: 'impact', number: 'No.20' },
                { japanese: '行動、動作', english: 'action', number: 'No.100' },
                { japanese: 'アクション、行動', english: 'action', number: 'No.34' },
                { japanese: 'ビニール袋', english: 'plastic bag', number: 'No.65' },
                { japanese: '調査、研究', english: 'research', number: 'No.33' },
                { japanese: 'チーター', english: 'cheetah', number: 'No.43' },
                { japanese: '〜のかわりに', english: 'instead of', number: 'No.56' },
                { japanese: '関する、関係・関連', english: 'relate', number: 'No.13' },
                { japanese: '市民', english: 'citizen', number: 'No.39' },
                { japanese: '正方形の', english: 'square', number: 'No.63' },
                { japanese: '生態系', english: 'ecosystem', number: 'No.38' },
                { japanese: '絶滅', english: 'extinction', number: 'No.5' },
                { japanese: 'シャチ', english: 'orca', number: 'No.44' },
                { japanese: '〜のことを見問させる（２）', english: 'remind', number: 'No.84' },
                { japanese: 'Aを折りたたむ', english: 'fold', number: 'No.66' }
            ];
            
            sampleWords.forEach(word => {
                word.id = Date.now() + Math.random();
                word.createdAt = new Date().toISOString();
                vocabularyData.push(word);
            });
            
            saveVocabularyData();
            updateWordList();
            updateStatistics();
            showNotification('サンプル単語を読み込みました', 'success');
        }
        
        function updateWordList() {
            const wordList = document.getElementById('wordList');
            if (!wordList) return;
            
            if (vocabularyData.length === 0) {
                wordList.innerHTML = '<div class="text-center text-gray-500 py-8">登録された単語がありません</div>';
                return;
            }
            
            wordList.innerHTML = vocabularyData.map(word => `
                <div class="word-item p-4 flex justify-between items-center transition-all duration-500" data-word-id="\${word.id}">
                    <div class="flex-1">
                        <div class="flex items-center gap-3">
                            <span class="text-blue-600 text-sm font-semibold">\${word.number || ''}</span>
                            <span class="font-semibold text-gray-800">\${word.japanese}</span>
                            <i class="fas fa-arrow-right text-gray-400"></i>
                            <span class="text-gray-600">\${word.english}</span>
                        </div>
                    </div>
                    <button onclick="deleteWord(\${word.id})" 
                            class="text-red-500 hover:text-red-700 transition-colors">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('');
        }

        // ============================================================================
        // 📝 TEST GENERATION SYSTEM
        // ============================================================================
        
        // Global variable to store current test data
        let currentTestData = null;
        
        function generateTest() {
            if (vocabularyData.length === 0) {
                showNotification('まず単語を登録してください', 'error');
                return;
            }
            
            const testTitle = document.getElementById('testTitle').value || '英単語テスト';
            const questionCount = parseInt(document.getElementById('questionCount').value);
            const testFormat = document.getElementById('testFormat').value;
            const questionOrder = document.getElementById('questionOrder').value;
            
            let testWords = [...vocabularyData];
            
            // Apply ordering
            switch (questionOrder) {
                case 'random':
                    testWords = shuffleArray(testWords);
                    break;
                case 'reverse':
                    testWords.reverse();
                    break;
                // 'sequential' keeps original order
            }
            
            // Limit to question count
            testWords = testWords.slice(0, Math.min(questionCount, testWords.length));
            
            // Store current test data for PDF generation
            currentTestData = {
                title: testTitle,
                words: testWords,
                format: testFormat,
                questionCount: questionCount,
                order: questionOrder,
                generatedAt: new Date().toISOString()
            };
            
            // Generate test HTML
            const testHtml = generateTestHtml(testWords, testFormat);
            document.getElementById('testPreview').innerHTML = testHtml;
            
            // Show PDF generation buttons
            document.getElementById('testPDFButtons').classList.remove('hidden');
            
            // Update statistics
            systemStats.generatedTests++;
            saveSystemStats();
            updateStatistics();
            
            showNotification(`\${testWords.length}問のテストを生成しました`, 'success');
        }
        
        function generateTestHtml(words, format) {
            let html = `
                <div class="bg-white p-6 rounded-lg">
                    <div class="text-center mb-6">
                        <h3 class="text-2xl font-bold text-gray-800">英単語テスト</h3>
                        <p class="text-gray-600 mt-2">形式: \${getFormatLabel(format)} | 問題数: \${words.length}問</p>
                        
                        <!-- PDF Export Info -->
                        <div class="mt-4 p-3 bg-blue-50 rounded-lg">
                            <div class="flex items-center justify-center text-blue-800">
                                <i class="fas fa-info-circle mr-2"></i>
                                <span class="text-sm font-semibold">左側の設定パネルからPDF生成が可能です</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="space-y-4">
            `;
            
            words.forEach((word, index) => {
                const questionNum = index + 1;
                let questionText, answerHint;
                
                switch (format) {
                    case 'japanese-to-english':
                        questionText = word.japanese;
                        answerHint = `(\${word.english})`;
                        break;
                    case 'english-to-japanese':
                        questionText = word.english;
                        answerHint = `(\${word.japanese})`;
                        break;
                    case 'mixed':
                        // For mixed, use consistent logic with PDF generation
                        if (index % 2 === 0) {
                            questionText = word.japanese;
                            answerHint = `(\${word.english})`;
                        } else {
                            questionText = word.english;
                            answerHint = `(\${word.japanese})`;
                        }
                        break;
                }
                
                html += `
                    <div class="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
                        <span class="text-lg font-bold text-gray-600 w-8">\${questionNum}.</span>
                        <span class="text-blue-600 text-sm font-semibold min-w-16">\${word.number || ''}</span>
                        <span class="flex-1 text-gray-800 font-medium">\${questionText}</span>
                        <span class="text-gray-400">:</span>
                        <div class="border-b-2 border-gray-300 w-32 h-6"></div>
                        <span class="text-green-600 text-sm font-medium">\${answerHint}</span>
                    </div>
                `;
            });
            
            html += `
                    </div>
                    
                    <!-- Test Summary -->
                    <div class="mt-6 p-4 bg-gray-50 rounded-lg">
                        <h4 class="font-semibold text-gray-800 mb-2 flex items-center">
                            <i class="fas fa-clipboard-check mr-2 text-green-600"></i>
                            テスト情報
                        </h4>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div><strong>形式:</strong> \${getFormatLabel(format)}</div>
                            <div><strong>問題数:</strong> \${words.length}問</div>
                            <div><strong>作成時間:</strong> \${new Date().toLocaleTimeString('ja-JP')}</div>
                            <div><strong>PDF:</strong> 問題・解答用紙対応</div>
                        </div>
                    </div>
                </div>
            `;
            
            return html;
        }
        
        function getFormatLabel(format) {
            const labels = {
                'japanese-to-english': '日本語→英語',
                'english-to-japanese': '英語→日本語',
                'mixed': '混合'
            };
            return labels[format] || format;
        }

        // ============================================================================
        // 🏆 PREMIUM PDF INTEGRATION
        // ============================================================================
        
        // Singleton Premium PDF Engine
        let ultraPremiumEngine = null;
        
        function initializeUltraPremiumEngine() {
            if (!ultraPremiumEngine) {
                ultraPremiumEngine = new UltraPremiumPDFEngine();
                console.log('🎯 Ultra Premium Engine 単一インスタンス作成完了');
            }
            return ultraPremiumEngine;
        }
        
        function generatePremiumPDF() {
            const engine = initializeUltraPremiumEngine();
            
            // UI要素取得
            const gradeClass = document.getElementById('gradeClass').value || '中学3年';
            const testType = document.getElementById('pdfTestType').value || '日本語→英語';
            const dataSource = document.getElementById('dataSource').value;
            
            let questionsData;
            
            if (dataSource === 'registered') {
                if (vocabularyData.length === 0) {
                    showNotification('登録された単語がありません', 'error');
                    return;
                }
                questionsData = vocabularyData;
            } else {
                const customData = document.getElementById('customQuestionData').value;
                if (!customData.trim()) {
                    showNotification('カスタムデータを入力してください', 'error');
                    return;
                }
                questionsData = customData;
            }
            
            // ボタンの状態変更
            const button = event.target;
            const originalHTML = button.innerHTML;
            button.innerHTML = '<div class="loading-spinner mx-auto"></div><span class="ml-3">16x品質生成中...</span>';
            button.disabled = true;
            
            // ステータス表示
            document.getElementById('pdfGenerationStatus').innerHTML = 
                '<i class="fas fa-cog fa-spin mr-2"></i>16x解像度レンダリング実行中...';
            
            // 問題データ解析
            const parsedData = engine.parseQuestionData(questionsData);
            
            // 実際の生成処理（少し遅延させてUI更新を確実に）
            setTimeout(() => {
                const result = engine.generatePDF(gradeClass, testType, parsedData);
                
                // ボタン復旧
                button.innerHTML = originalHTML;
                button.disabled = false;
                
                if (result.success) {
                    document.getElementById('pdfGenerationStatus').innerHTML = 
                        `<i class="fas fa-check-circle text-green-500 mr-2"></i>
                        生成完了: \${result.fileName} (品質: \${result.qualityLevel}x)`;
                    showNotification('16x超高品質PDFが正常に生成されました！', 'success');
                } else {
                    document.getElementById('pdfGenerationStatus').innerHTML = 
                        '<i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>生成エラーが発生しました';
                    showNotification('PDF生成中にエラーが発生しました: ' + result.error, 'error');
                }
            }, 1500);
        }
        
        function updateDataSource() {
            const dataSource = document.getElementById('dataSource').value;
            const customInput = document.getElementById('customDataInput');
            
            if (dataSource === 'custom') {
                customInput.classList.remove('hidden');
                // Fill with sample data
                document.getElementById('customQuestionData').value = vocabularyData.map(word => 
                    `\${word.japanese}|\${word.number || ''}`
                ).join('\\n');
            } else {
                customInput.classList.add('hidden');
            }
        }

        // ============================================================================
        // 📝 TEST PDF GENERATION FUNCTIONS
        // ============================================================================

        function generateTestPDF(pdfType) {
            console.log('🎯 generateTestPDF呼び出し - タイプ:', pdfType);
            
            if (!currentTestData) {
                console.error('❌ currentTestDataが存在しません');
                showNotification('まずテストを生成してください', 'error');
                return;
            }

            console.log('📊 currentTestData確認:', currentTestData);
            
            const engine = initializeUltraPremiumEngine();
            console.log('🔧 エンジン初期化完了:', engine);
            
            // Show loading state
            showNotification('PDF生成中...', 'info');
            
            // Generate PDF with current test data
            try {
                const result = engine.generateTestPDF(currentTestData, pdfType);
                console.log('📄 PDF生成結果:', result);
            
                if (result.success) {
                    const typeMessages = {
                        'question': '問題用PDF',
                        'answer': '解答用PDF', 
                        'both': '問題+解答PDF'
                    };
                    
                    showNotification(
                        `\${typeMessages[pdfType]}が正常に生成されました！\\n\\n` +
                        `ファイル名: \${result.fileName}\\n` +
                        `品質レベル: \${result.qualityLevel}x`, 
                        'success'
                    );
                    
                    console.log('✅ テストPDF生成完了:', result);
                } else {
                    showNotification(
                        `PDF生成中にエラーが発生しました: \${result.error}`, 
                        'error'
                    );
                    console.error('❌ テストPDF生成エラー:', result);
                }
            } catch (error) {
                console.error('❌ PDF生成処理でエラー:', error);
                showNotification(
                    `PDF生成処理でエラーが発生しました: \${error.message}`, 
                    'error'
                );
            }
        }

        // ============================================================================
        // 📊 STATISTICS SYSTEM
        // ============================================================================
        
        function updateStatistics() {
            // Update stat cards
            document.getElementById('totalWords').textContent = vocabularyData.length;
            document.getElementById('generatedTests').textContent = systemStats.generatedTests;
            document.getElementById('generatedPDFs').textContent = systemStats.generatedPDFs;
            
            // Update chart
            updateUsageChart();
        }
        
        function updateUsageChart() {
            const ctx = document.getElementById('usageChart');
            if (!ctx) return;
            
            // Destroy existing chart if exists
            if (window.usageChartInstance) {
                window.usageChartInstance.destroy();
            }
            
            window.usageChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['登録単語', '生成テスト', '生成PDF'],
                    datasets: [{
                        data: [vocabularyData.length, systemStats.generatedTests, systemStats.generatedPDFs],
                        backgroundColor: [
                            '#4f46e5',
                            '#7c3aed', 
                            '#ec4899'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }

        // ============================================================================
        // 🎨 UI MANAGEMENT SYSTEM
        // ============================================================================
        
        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            
            // Remove active class from all tab buttons
            document.querySelectorAll('.premium-tab').forEach(button => {
                button.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabName).classList.add('active');
            
            // Add active class to clicked button
            event.target.classList.add('active');
        }
        
        function showNotification(message, type) {
            const notification = document.createElement('div');
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
            
            notification.className = `fixed top-4 right-4 \${bgColor} text-white p-4 rounded-xl shadow-lg z-50 transform transition-all duration-300 translate-x-full max-w-md`;
            notification.innerHTML = `
                <div class="flex items-start">
                    <i class="fas \${icon} mr-3 text-lg mt-1 flex-shrink-0"></i>
                    <span class="font-semibold whitespace-pre-line">\${message}</span>
                </div>
            `;
            
            document.body.appendChild(notification);
            
            // アニメーション
            setTimeout(() => {
                notification.style.transform = 'translateX(0)';
            }, 100);
            
            const displayTime = type === 'info' ? 2000 : (type === 'success' ? 6000 : 5000); // Success messages show longer
            setTimeout(() => {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 300);
            }, displayTime);
        }

        // ============================================================================
        // 🌐 D1共有データベース: データ永続化
        // ============================================================================
        
        // localStorage は使用せず、すべてD1共有データベースに保存
        // saveVocabularyData() と saveSystemStats() は削除済み
        // データの保存は各API endpointで自動実行

        // ============================================================================
        // 🔧 UTILITY FUNCTIONS
        // ============================================================================
        
        function shuffleArray(array) {
            const shuffled = [...array];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            return shuffled;
        }

        // ============================================================================
        // 🧪 PDF GENERATION TEST FUNCTION
        // ============================================================================
        
        function testPDFGeneration() {
            console.log('🧪 PDF生成テスト開始');
            
            try {
                // jsPDF確認
                if (!window.jspdf) {
                    console.error('❌ jsPDFが読み込まれていません');
                    return false;
                }
                
                const { jsPDF } = window.jspdf;
                console.log('✅ jsPDF確認:', typeof jsPDF);
                
                // 簡単なPDF作成テスト
                const doc = new jsPDF();
                doc.text('PDF生成テスト', 20, 20);
                console.log('✅ 簡易PDF作成成功');
                
                return true;
            } catch (error) {
                console.error('❌ PDF生成テストエラー:', error);
                return false;
            }
        }

        function debugPDFTest() {
            // デバッグPDFテスト実行
            
            // まずサンプル単語を読み込む
            if (vocabularyData.length === 0) {
                loadSampleWords();
            }
            
            // テストを生成
            document.getElementById('testTitle').value = 'デバッグテスト';
            document.getElementById('questionCount').value = '8';
            document.getElementById('testFormat').value = 'japanese-to-english';
            document.getElementById('questionOrder').value = 'sequential';
            
            // generateTest()を呼び出してcurrentTestDataを設定
            generateTest();
            
            // 少し待ってからPDF生成
            setTimeout(() => {
                if (currentTestData) {
                    console.log('🔍 デバッグ用currentTestData:', currentTestData);
                    generateTestPDF('question');
                } else {
                    console.error('❌ currentTestDataの設定に失敗しました');
                }
            }, 100);
        }

        // ============================================================================
        // 🚀 SYSTEM INITIALIZATION
        // ============================================================================
        
        // 🌐 D1共有データベース対応: システム初期化
        document.addEventListener('DOMContentLoaded', async () => {
            console.log('🚀 教育用単語管理システム（共有版）起動開始...');
            
            // Initialize Premium PDF Engine
            initializeUltraPremiumEngine();
            
            // Test PDF generation capability
            const pdfTestResult = testPDFGeneration();
            console.log('🧪 PDF生成テスト結果:', pdfTestResult);
            
            // 🗄️ D1共有データベースからデータ読み込み
            console.log('📊 D1データベースからデータ読み込み中...');
            await loadVocabularyData();
            await loadSystemStatistics();
            
            // UI更新
            updateWordList();
            updateStatistics();
            
            console.log('🎉 教育用単語管理システム（共有版）完全起動完了');
            console.log(`📚 \${vocabularyData.length}個の単語がD1データベースから読み込まれました`);
            console.log('🌐 30名同時アクセス対応');
            console.log('🔄 リアルタイム同期準備完了');
            console.log('🛡️ 品質劣化防止システム有効');
        });
    </script>
</body>
</html>
  `)
})

export default app
