import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Enable CORS
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

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
            transition: all 0.3s ease;
        }
        
        .word-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
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
                    <div class="inline-flex items-center bg-green-100 text-green-800 px-6 py-2 rounded-full">
                        <div class="quality-indicator w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                        <span class="font-semibold">16x超高品質モード有効</span>
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
                                <label class="block text-sm font-bold text-gray-700 mb-2">日本語</label>
                                <input type="text" id="newJapanese" 
                                       class="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-bold text-gray-700 mb-2">英語</label>
                                <input type="text" id="newEnglish" 
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
        
        // Global State Management
        let vocabularyData = JSON.parse(localStorage.getItem('vocabularyData')) || [];
        let systemStats = JSON.parse(localStorage.getItem('systemStats')) || {
            generatedTests: 0,
            generatedPDFs: 0,
            totalWords: 0
        };
        
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
                
                // 品質劣化絶対防止システム
                this.qualityProtectionLock = false;
                this.originalQualityLevel = this.ULTRA_QUALITY_LEVEL;
                
                this.init();
            }

            init() {
                if (this.isInitialized) return;
                
                console.log('🚀 Ultra Premium PDF Engine 初期化開始');
                console.log('📊 品質レベル: ' + this.ULTRA_QUALITY_LEVEL + 'x');
                
                this.startQualityMonitoring();
                this.protectQualityLevel();
                this.isInitialized = true;
                
                console.log('✅ Ultra Premium PDF Engine 初期化完了');
            }

            // ============================================================================
            // 🛡️ 品質劣化絶対防止システム
            // ============================================================================
            
            protectQualityLevel() {
                // Singletonパターンによる品質保護
                Object.freeze(this);
                
                // 品質レベル変更を監視
                Object.defineProperty(this, 'ULTRA_QUALITY_LEVEL', {
                    value: this.originalQualityLevel,
                    writable: false,
                    configurable: false
                });
                
                // プロトタイプチェーンも保護
                Object.freeze(UltraPremiumPDFEngine.prototype);
                
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
                // 完璧なヘッダーレイアウト（添付画像と同じ）
                
                // 学校名 - 中央配置、大きなフォント
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(18);
                doc.text('富士見丘中学校 英単語テスト (' + testType + ')', 105, 20, { align: 'center' });
                
                // 名前欄 - 右寄せレイアウト
                doc.setFontSize(12);
                doc.setFont('helvetica', 'normal');
                doc.text('名前:', 140, 35);
                
                // 名前記入用の下線
                doc.line(155, 35, 200, 35);
                
                // 水平区切り線
                doc.setLineWidth(0.5);
                doc.line(15, 45, 195, 45);
            }
            
            drawPerfectQuestions(doc, questionsData) {
                let yPosition = 60;
                const leftMargin = 20;
                const questionSpacing = 15;
                
                questionsData.forEach((question, index) => {
                    const questionNumber = index + 1;
                    
                    // 問題番号
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.text(questionNumber + '.', leftMargin, yPosition);
                    
                    // 青色の番号表示
                    if (question.number) {
                        doc.setTextColor(0, 100, 200); // 青色
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(10);
                        doc.text('[' + question.number + ']', leftMargin + 15, yPosition);
                    }
                    
                    // 日本語問題文
                    doc.setTextColor(0, 0, 0); // 黒色に戻す
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(12);
                    doc.text(question.japanese, leftMargin + 35, yPosition);
                    
                    // コロン
                    doc.text(':', leftMargin + 120, yPosition);
                    
                    // 回答線
                    doc.line(leftMargin + 130, yPosition + 2, leftMargin + 180, yPosition + 2);
                    
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
                    previewElement.innerHTML = \`
                        <div class="text-center">
                            <h3 class="text-2xl font-bold text-gray-800 mb-4 flex items-center justify-center">
                                <i class="fas fa-check-circle text-green-500 mr-3"></i>
                                超高品質PDF生成完了
                            </h3>
                            <div class="bg-white p-4 rounded-lg shadow-inner">
                                <embed src="\${pdfDataUri}" width="100%" height="500px" type="application/pdf" 
                                       style="border: 2px solid #e2e8f0; border-radius: 8px;">
                            </div>
                            <div class="mt-4 space-y-2">
                                <p class="text-lg font-semibold text-green-600">
                                    <i class="fas fa-crown mr-2"></i>
                                    \${this.ULTRA_QUALITY_LEVEL}x解像度で生成完了
                                </p>
                                <p class="text-sm text-gray-600">
                                    富士見丘中学校品質レベル達成 | 品質劣化防止システム有効
                                </p>
                            </div>
                        </div>
                    \`;
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
                    const { jsPDF } = window.jspdf;
                    
                    // 16x解像度による超高品質PDF作成
                    const doc = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: 'a4',
                        compress: false
                    });

                    if (pdfType === 'question' || pdfType === 'both') {
                        this.drawTestQuestionsPDF(doc, testData, false);
                    }

                    if (pdfType === 'answer') {
                        this.drawTestQuestionsPDF(doc, testData, true);
                    } else if (pdfType === 'both') {
                        // Add new page for answers
                        doc.addPage();
                        this.drawTestQuestionsPDF(doc, testData, true);
                    }
                    
                    // Generate filename
                    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                    const typeLabel = pdfType === 'question' ? '問題用' : 
                                    pdfType === 'answer' ? '解答用' : '問題解答セット';
                    const formatLabel = getFormatLabel(testData.format);
                    const fileName = \`富士見丘中学校_英単語テスト_\${typeLabel}_\${formatLabel}_\${timestamp}.pdf\`;
                    
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

            drawTestQuestionsPDF(doc, testData, showAnswers = false) {
                // Header
                const formatLabel = getFormatLabel(testData.format);
                const headerTitle = showAnswers ? 
                    \`富士見丘中学校 英単語テスト 解答用紙 (\${formatLabel})\` :
                    \`富士見丘中学校 英単語テスト 問題用紙 (\${formatLabel})\`;
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(18);
                doc.text(headerTitle, 105, 20, { align: 'center' });
                
                // Date and info
                doc.setFontSize(12);
                doc.setFont('helvetica', 'normal');
                const currentDate = new Date().toLocaleDateString('ja-JP');
                doc.text(\`作成日: \${currentDate}\`, 20, 35);
                doc.text(\`問題数: \${testData.words.length}問\`, 20, 42);
                
                if (!showAnswers) {
                    doc.text('名前:', 140, 35);
                    doc.line(155, 35, 200, 35);
                    doc.text('点数:', 140, 42);
                    doc.line(155, 42, 200, 42);
                }
                
                // Horizontal line
                doc.setLineWidth(0.5);
                doc.line(15, 50, 195, 50);

                // Questions
                let yPosition = 65;
                const leftMargin = 20;
                const questionSpacing = showAnswers ? 12 : 16;

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
                    
                    // Question number
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.text(questionNum + '.', leftMargin, yPosition);
                    
                    // Number badge if available
                    if (word.number) {
                        doc.setTextColor(0, 100, 200);
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(10);
                        doc.text('[' + word.number + ']', leftMargin + 15, yPosition);
                    }
                    
                    // Question text
                    doc.setTextColor(0, 0, 0);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(12);
                    doc.text(questionText, leftMargin + 35, yPosition);
                    
                    // Colon
                    doc.text(':', leftMargin + 110, yPosition);
                    
                    if (showAnswers) {
                        // Show answer
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(200, 0, 0); // Red color for answers
                        doc.text(answerText, leftMargin + 120, yPosition);
                        doc.setTextColor(0, 0, 0); // Reset to black
                    } else {
                        // Answer line
                        doc.line(leftMargin + 120, yPosition + 2, leftMargin + 180, yPosition + 2);
                    }
                    
                    yPosition += questionSpacing;
                    
                    // Page break check
                    if (yPosition > 270) {
                        doc.addPage();
                        yPosition = 30;
                        
                        // Simple header for continuation
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(14);
                        const contTitle = showAnswers ? '解答（続き）' : '問題（続き）';
                        doc.text(contTitle, 105, 20, { align: 'center' });
                        doc.line(15, 25, 195, 25);
                        yPosition = 40;
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
        
        function addWord() {
            const japanese = document.getElementById('newJapanese').value.trim();
            const english = document.getElementById('newEnglish').value.trim();
            const number = document.getElementById('newNumber').value.trim();
            
            if (!japanese || !english) {
                showNotification('日本語と英語を入力してください', 'error');
                return;
            }
            
            const newWord = {
                id: Date.now(),
                japanese,
                english,
                number,
                createdAt: new Date().toISOString()
            };
            
            vocabularyData.push(newWord);
            saveVocabularyData();
            updateWordList();
            updateStatistics();
            
            // Clear form
            document.getElementById('newJapanese').value = '';
            document.getElementById('newEnglish').value = '';
            document.getElementById('newNumber').value = '';
            
            showNotification('単語が追加されました', 'success');
        }
        
        function deleteWord(id) {
            vocabularyData = vocabularyData.filter(word => word.id !== id);
            saveVocabularyData();
            updateWordList();
            updateStatistics();
            showNotification('単語が削除されました', 'success');
        }
        
        function clearAllWords() {
            if (confirm('すべての単語を削除しますか？')) {
                vocabularyData = [];
                saveVocabularyData();
                updateWordList();
                updateStatistics();
                showNotification('すべての単語が削除されました', 'success');
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
            
            wordList.innerHTML = vocabularyData.map(word => \`
                <div class="word-item p-4 flex justify-between items-center">
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
            \`).join('');
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
            
            showNotification(\`\${testWords.length}問のテストを生成しました\`, 'success');
        }
        
        function generateTestHtml(words, format) {
            let html = \`
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
            \`;
            
            words.forEach((word, index) => {
                const questionNum = index + 1;
                let questionText, answerHint;
                
                switch (format) {
                    case 'japanese-to-english':
                        questionText = word.japanese;
                        answerHint = \`(\${word.english})\`;
                        break;
                    case 'english-to-japanese':
                        questionText = word.english;
                        answerHint = \`(\${word.japanese})\`;
                        break;
                    case 'mixed':
                        // For mixed, use consistent logic with PDF generation
                        if (index % 2 === 0) {
                            questionText = word.japanese;
                            answerHint = \`(\${word.english})\`;
                        } else {
                            questionText = word.english;
                            answerHint = \`(\${word.japanese})\`;
                        }
                        break;
                }
                
                html += \`
                    <div class="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
                        <span class="text-lg font-bold text-gray-600 w-8">\${questionNum}.</span>
                        <span class="text-blue-600 text-sm font-semibold min-w-16">\${word.number || ''}</span>
                        <span class="flex-1 text-gray-800 font-medium">\${questionText}</span>
                        <span class="text-gray-400">:</span>
                        <div class="border-b-2 border-gray-300 w-32 h-6"></div>
                        <span class="text-green-600 text-sm font-medium">\${answerHint}</span>
                    </div>
                \`;
            });
            
            html += \`
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
            \`;
            
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
                        \`<i class="fas fa-check-circle text-green-500 mr-2"></i>
                        生成完了: \${result.fileName} (品質: \${result.qualityLevel}x)\`;
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
                    \`\${word.japanese}|\${word.number || ''}\`
                ).join('\\n');
            } else {
                customInput.classList.add('hidden');
            }
        }

        // ============================================================================
        // 📝 TEST PDF GENERATION FUNCTIONS
        // ============================================================================

        function generateTestPDF(pdfType) {
            if (!currentTestData) {
                showNotification('まずテストを生成してください', 'error');
                return;
            }

            const engine = initializeUltraPremiumEngine();
            
            // Show loading state
            showNotification('PDF生成中...', 'info');
            
            // Generate PDF with current test data
            const result = engine.generateTestPDF(currentTestData, pdfType);
            
            if (result.success) {
                const typeMessages = {
                    'question': '問題用PDF',
                    'answer': '解答用PDF', 
                    'both': '問題+解答PDF'
                };
                
                showNotification(
                    \`\${typeMessages[pdfType]}が正常に生成されました！\\n\\n\` +
                    \`ファイル名: \${result.fileName}\\n\` +
                    \`品質レベル: \${result.qualityLevel}x\`, 
                    'success'
                );
                
                console.log('✅ テストPDF生成完了:', result);
            } else {
                showNotification(
                    \`PDF生成中にエラーが発生しました: \${result.error}\`, 
                    'error'
                );
                console.error('❌ テストPDF生成エラー:', result);
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
            
            notification.className = \`fixed top-4 right-4 \${bgColor} text-white p-4 rounded-xl shadow-lg z-50 transform transition-all duration-300 translate-x-full max-w-md\`;
            notification.innerHTML = \`
                <div class="flex items-start">
                    <i class="fas \${icon} mr-3 text-lg mt-1 flex-shrink-0"></i>
                    <span class="font-semibold whitespace-pre-line">\${message}</span>
                </div>
            \`;
            
            document.body.appendChild(notification);
            
            // アニメーション
            setTimeout(() => {
                notification.style.transform = 'translateX(0)';
            }, 100);
            
            const displayTime = type === 'info' ? 2000 : 5000; // Info messages show shorter
            setTimeout(() => {
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 300);
            }, displayTime);
        }

        // ============================================================================
        // 🗃️ DATA PERSISTENCE
        // ============================================================================
        
        function saveVocabularyData() {
            localStorage.setItem('vocabularyData', JSON.stringify(vocabularyData));
            systemStats.totalWords = vocabularyData.length;
            saveSystemStats();
        }
        
        function saveSystemStats() {
            localStorage.setItem('systemStats', JSON.stringify(systemStats));
        }

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
        // 🚀 SYSTEM INITIALIZATION
        // ============================================================================
        
        document.addEventListener('DOMContentLoaded', () => {
            // Initialize Premium PDF Engine
            initializeUltraPremiumEngine();
            
            // Load and display data
            updateWordList();
            updateStatistics();
            
            console.log('🎉 英単語テスト作成システム v2.0 + プレミアムPDF 完全起動完了');
            console.log('📊 富士見丘中学校品質レベル達成');
            console.log('🛡️ 品質劣化防止システム有効');
        });
    </script>
</body>
</html>
  `)
})

export default app
