import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// 英単語データベース（実際のプロジェクトではCloudflare D1を使用）
interface VocabularyWord {
  id: string
  word: string
  meaning: string
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
}

// サンプル英単語データ
const vocabularyDatabase: VocabularyWord[] = [
  { id: '1', word: 'apple', meaning: 'りんご', difficulty: 'easy', category: '食べ物' },
  { id: '2', word: 'beautiful', meaning: '美しい', difficulty: 'medium', category: '形容詞' },
  { id: '3', word: 'curiosity', meaning: '好奇心', difficulty: 'hard', category: '名詞' },
  { id: '4', word: 'delicious', meaning: 'おいしい', difficulty: 'medium', category: '形容詞' },
  { id: '5', word: 'elephant', meaning: '象', difficulty: 'easy', category: '動物' },
  { id: '6', word: 'fantastic', meaning: '素晴らしい', difficulty: 'medium', category: '形容詞' },
  { id: '7', word: 'grateful', meaning: '感謝の', difficulty: 'medium', category: '形容詞' },
  { id: '8', word: 'happiness', meaning: '幸せ', difficulty: 'medium', category: '名詞' },
  { id: '9', word: 'important', meaning: '重要な', difficulty: 'medium', category: '形容詞' },
  { id: '10', word: 'journey', meaning: '旅', difficulty: 'medium', category: '名詞' },
  { id: '11', word: 'knowledge', meaning: '知識', difficulty: 'hard', category: '名詞' },
  { id: '12', word: 'literature', meaning: '文学', difficulty: 'hard', category: '名詞' },
  { id: '13', word: 'mountain', meaning: '山', difficulty: 'easy', category: '自然' },
  { id: '14', word: 'necessary', meaning: '必要な', difficulty: 'medium', category: '形容詞' },
  { id: '15', word: 'opportunity', meaning: '機会', difficulty: 'hard', category: '名詞' },
  { id: '16', word: 'peaceful', meaning: '平和な', difficulty: 'medium', category: '形容詞' },
  { id: '17', word: 'question', meaning: '質問', difficulty: 'easy', category: '名詞' },
  { id: '18', word: 'responsibility', meaning: '責任', difficulty: 'hard', category: '名詞' },
  { id: '19', word: 'successful', meaning: '成功した', difficulty: 'medium', category: '形容詞' },
  { id: '20', word: 'television', meaning: 'テレビ', difficulty: 'easy', category: '家電' }
]

interface TestConfig {
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  count: number
  category?: string
  format: 'multiple-choice' | 'fill-blank' | 'matching'
}

// API エンドポイント

// 全単語取得
app.get('/api/vocabulary', (c) => {
  return c.json({ words: vocabularyDatabase })
})

// カテゴリ一覧取得
app.get('/api/categories', (c) => {
  const categories = [...new Set(vocabularyDatabase.map(w => w.category))]
  return c.json({ categories })
})

// テスト生成
app.post('/api/generate-test', async (c) => {
  const config: TestConfig = await c.req.json()
  
  let filteredWords = vocabularyDatabase
  
  // 難易度フィルター
  if (config.difficulty !== 'mixed') {
    filteredWords = filteredWords.filter(w => w.difficulty === config.difficulty)
  }
  
  // カテゴリフィルター
  if (config.category) {
    filteredWords = filteredWords.filter(w => w.category === config.category)
  }
  
  // ランダム選択
  const shuffled = filteredWords.sort(() => 0.5 - Math.random())
  const selectedWords = shuffled.slice(0, Math.min(config.count, shuffled.length))
  
  // 問題形式に応じて問題生成
  let questions = []
  
  if (config.format === 'multiple-choice') {
    questions = selectedWords.map(word => {
      const wrongAnswers = vocabularyDatabase
        .filter(w => w.id !== word.id)
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(w => w.meaning)
      
      const options = [word.meaning, ...wrongAnswers].sort(() => 0.5 - Math.random())
      
      return {
        id: word.id,
        question: `「${word.word}」の意味は？`,
        word: word.word,
        options,
        correctAnswer: word.meaning,
        type: 'multiple-choice'
      }
    })
  } else if (config.format === 'fill-blank') {
    questions = selectedWords.map(word => ({
      id: word.id,
      question: `「${word.meaning}」を英語で書いてください`,
      correctAnswer: word.word,
      type: 'fill-blank'
    }))
  } else if (config.format === 'matching') {
    const words = selectedWords.map(w => w.word).sort(() => 0.5 - Math.random())
    const meanings = selectedWords.map(w => w.meaning).sort(() => 0.5 - Math.random())
    
    questions = [{
      id: 'matching-1',
      question: '英単語と日本語の意味を線で結びなさい',
      words,
      meanings,
      correctPairs: selectedWords.map(w => ({ word: w.word, meaning: w.meaning })),
      type: 'matching'
    }]
  }
  
  return c.json({
    test: {
      id: Date.now().toString(),
      config,
      questions,
      createdAt: new Date().toISOString()
    }
  })
})

// PDF生成（プレミアム機能）
app.post('/api/generate-pdf', async (c) => {
  const { test, options } = await c.req.json()
  
  // 実際のPDF生成はCloudflare Workersで制限があるため、
  // ここではHTMLコンテンツを生成してPDF生成用のデータを返します
  const htmlContent = generatePDFContent(test, options)
  
  return c.json({
    success: true,
    pdfData: {
      content: htmlContent,
      filename: `vocabulary-test-${test.id}.pdf`,
      downloadUrl: `/api/download-pdf/${test.id}`
    }
  })
})

// PDFダウンロード（実装例）
app.get('/api/download-pdf/:testId', (c) => {
  const testId = c.req.param('testId')
  
  // 実際の実装では、生成されたPDFファイルを返します
  return c.json({
    message: 'PDF download endpoint',
    testId,
    note: 'プレミアム機能：実際のPDF生成には外部APIまたはCloudflare R2連携が必要です'
  })
})

// PDF生成用HTMLコンテンツ作成
function generatePDFContent(test: any, options: any) {
  const { includeAnswers = false, layout = 'standard' } = options
  
  let html = `
    <html>
    <head>
      <style>
        body { font-family: 'Arial', sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .question { margin-bottom: 20px; page-break-inside: avoid; }
        .options { margin-left: 20px; }
        .answer-key { page-break-before: always; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>英単語テスト</h1>
        <p>作成日: ${new Date().toLocaleDateString('ja-JP')}</p>
        <p>問題数: ${test.questions.length}問</p>
      </div>
  `
  
  test.questions.forEach((q: any, index: number) => {
    html += `<div class="question">
      <h3>問題 ${index + 1}</h3>
      <p>${q.question}</p>`
    
    if (q.type === 'multiple-choice') {
      html += '<div class="options">'
      q.options.forEach((option: string, i: number) => {
        const letter = String.fromCharCode(65 + i)
        html += `<p>${letter}. ${option}</p>`
      })
      html += '</div>'
    } else if (q.type === 'fill-blank') {
      html += '<p>答え: ________________</p>'
    }
    
    html += '</div>'
  })
  
  if (includeAnswers) {
    html += '<div class="answer-key"><h2>解答</h2>'
    test.questions.forEach((q: any, index: number) => {
      html += `<p>問題 ${index + 1}: ${q.correctAnswer}</p>`
    })
    html += '</div>'
  }
  
  html += '</body></html>'
  
  return html
}

// メインページ
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>英単語テストシステム v2.0 Premium</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50 min-h-screen">
        <div class="max-w-6xl mx-auto p-6">
            <header class="text-center mb-8">
                <h1 class="text-4xl font-bold text-blue-600 mb-2">
                    <i class="fas fa-graduation-cap mr-3"></i>
                    英単語テストシステム v2.0
                </h1>
                <p class="text-xl text-gray-600">Premium PDF生成機能付き</p>
                <div class="mt-4 inline-block bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full">
                    <i class="fas fa-star mr-1"></i>
                    Premium Version 2.1.0
                </div>
            </header>

            <!-- テスト作成フォーム -->
            <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
                <h2 class="text-2xl font-semibold mb-4 text-gray-800">
                    <i class="fas fa-cogs mr-2"></i>
                    テスト作成設定
                </h2>
                
                <div class="grid md:grid-cols-2 gap-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">難易度</label>
                        <select id="difficulty" class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="mixed">ミックス（全レベル）</option>
                            <option value="easy">初級</option>
                            <option value="medium">中級</option>
                            <option value="hard">上級</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">問題形式</label>
                        <select id="format" class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="multiple-choice">選択問題</option>
                            <option value="fill-blank">穴埋め問題</option>
                            <option value="matching">マッチング問題</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">カテゴリ</label>
                        <select id="category" class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">すべて</option>
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">問題数</label>
                        <input type="number" id="count" value="10" min="1" max="50" 
                               class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                </div>
                
                <div class="mt-6 flex gap-4">
                    <button id="generateTest" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium transition duration-200">
                        <i class="fas fa-play mr-2"></i>
                        テスト生成
                    </button>
                    
                    <button id="generatePDF" class="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3 rounded-md font-medium transition duration-200" disabled>
                        <i class="fas fa-file-pdf mr-2"></i>
                        PDF生成（Premium）
                    </button>
                </div>
            </div>

            <!-- テスト結果表示エリア -->
            <div id="testArea" class="bg-white rounded-lg shadow-lg p-6 hidden">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-semibold text-gray-800">
                        <i class="fas fa-clipboard-list mr-2"></i>
                        生成されたテスト
                    </h2>
                    <div class="flex gap-2">
                        <button id="startTest" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium">
                            <i class="fas fa-play mr-1"></i>
                            テスト開始
                        </button>
                        <button id="showAnswers" class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium">
                            <i class="fas fa-eye mr-1"></i>
                            解答表示
                        </button>
                    </div>
                </div>
                
                <div id="testContent"></div>
            </div>

            <!-- テスト実行エリア -->
            <div id="testExecution" class="bg-white rounded-lg shadow-lg p-6 hidden">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-semibold text-gray-800">
                        <i class="fas fa-pencil-alt mr-2"></i>
                        テスト実行中
                    </h2>
                    <div class="text-lg font-medium text-blue-600">
                        <span id="currentQuestion">1</span> / <span id="totalQuestions">10</span>
                    </div>
                </div>
                
                <div id="questionArea"></div>
                
                <div class="mt-6 flex justify-between">
                    <button id="prevQuestion" class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-medium" disabled>
                        <i class="fas fa-arrow-left mr-1"></i>
                        前の問題
                    </button>
                    <button id="nextQuestion" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium">
                        次の問題
                        <i class="fas fa-arrow-right ml-1"></i>
                    </button>
                    <button id="finishTest" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium hidden">
                        <i class="fas fa-check mr-1"></i>
                        テスト終了
                    </button>
                </div>
            </div>

            <!-- 結果表示エリア -->
            <div id="resultArea" class="bg-white rounded-lg shadow-lg p-6 hidden">
                <h2 class="text-2xl font-semibold text-gray-800 mb-4">
                    <i class="fas fa-chart-line mr-2"></i>
                    テスト結果
                </h2>
                <div id="resultContent"></div>
            </div>

            <!-- 統計情報 -->
            <div class="grid md:grid-cols-3 gap-6 mt-6">
                <div class="bg-white rounded-lg shadow p-6 text-center">
                    <i class="fas fa-book text-3xl text-blue-600 mb-3"></i>
                    <h3 class="text-lg font-semibold text-gray-800">単語データベース</h3>
                    <p class="text-2xl font-bold text-blue-600" id="totalWords">20</p>
                    <p class="text-gray-600">語収録</p>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6 text-center">
                    <i class="fas fa-layer-group text-3xl text-green-600 mb-3"></i>
                    <h3 class="text-lg font-semibold text-gray-800">カテゴリ数</h3>
                    <p class="text-2xl font-bold text-green-600" id="totalCategories">6</p>
                    <p class="text-gray-600">カテゴリ</p>
                </div>
                
                <div class="bg-white rounded-lg shadow p-6 text-center">
                    <i class="fas fa-star text-3xl text-yellow-500 mb-3"></i>
                    <h3 class="text-lg font-semibold text-gray-800">Premium機能</h3>
                    <p class="text-2xl font-bold text-yellow-500">PDF</p>
                    <p class="text-gray-600">出力対応</p>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

export default app
