// 英単語テストシステム v2.0 Premium - フロントエンドJavaScript

class VocabularyTestSystem {
    constructor() {
        this.currentTest = null;
        this.currentQuestionIndex = 0;
        this.userAnswers = [];
        this.isTestMode = false;
        
        this.init();
    }

    async init() {
        await this.loadCategories();
        this.bindEvents();
        await this.updateStats();
    }

    async loadCategories() {
        try {
            const response = await axios.get('/api/categories');
            const categories = response.data.categories;
            
            const categorySelect = document.getElementById('category');
            categorySelect.innerHTML = '<option value="">すべて</option>';
            
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categorySelect.appendChild(option);
            });
            
        } catch (error) {
            console.error('カテゴリの読み込みに失敗しました:', error);
        }
    }

    async updateStats() {
        try {
            const response = await axios.get('/api/vocabulary');
            const words = response.data.words;
            
            document.getElementById('totalWords').textContent = words.length;
            
            const categories = [...new Set(words.map(w => w.category))];
            document.getElementById('totalCategories').textContent = categories.length;
            
        } catch (error) {
            console.error('統計情報の更新に失敗しました:', error);
        }
    }

    bindEvents() {
        document.getElementById('generateTest').addEventListener('click', () => this.generateTest());
        document.getElementById('generatePDF').addEventListener('click', () => this.generatePDF());
        document.getElementById('startTest').addEventListener('click', () => this.startTest());
        document.getElementById('showAnswers').addEventListener('click', () => this.showAnswers());
        document.getElementById('prevQuestion').addEventListener('click', () => this.previousQuestion());
        document.getElementById('nextQuestion').addEventListener('click', () => this.nextQuestion());
        document.getElementById('finishTest').addEventListener('click', () => this.finishTest());
    }

    async generateTest() {
        try {
            const config = {
                difficulty: document.getElementById('difficulty').value,
                format: document.getElementById('format').value,
                category: document.getElementById('category').value || undefined,
                count: parseInt(document.getElementById('count').value)
            };

            const response = await axios.post('/api/generate-test', config);
            this.currentTest = response.data.test;
            
            this.displayTest();
            document.getElementById('generatePDF').disabled = false;
            
        } catch (error) {
            console.error('テスト生成に失敗しました:', error);
            alert('テスト生成に失敗しました。もう一度お試しください。');
        }
    }

    displayTest() {
        const testArea = document.getElementById('testArea');
        const testContent = document.getElementById('testContent');
        
        let html = `
            <div class="mb-4 p-4 bg-blue-50 rounded-lg">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><strong>難易度:</strong> ${this.getDifficultyLabel(this.currentTest.config.difficulty)}</div>
                    <div><strong>形式:</strong> ${this.getFormatLabel(this.currentTest.config.format)}</div>
                    <div><strong>問題数:</strong> ${this.currentTest.questions.length}問</div>
                    <div><strong>カテゴリ:</strong> ${this.currentTest.config.category || 'すべて'}</div>
                </div>
            </div>
            
            <div class="space-y-6">
        `;

        this.currentTest.questions.forEach((question, index) => {
            html += `<div class="p-4 border border-gray-200 rounded-lg">`;
            html += `<h4 class="font-semibold text-lg mb-3">問題 ${index + 1}</h4>`;
            html += `<p class="mb-3">${question.question}</p>`;

            if (question.type === 'multiple-choice') {
                question.options.forEach((option, i) => {
                    const letter = String.fromCharCode(65 + i);
                    html += `<div class="mb-2">
                        <span class="inline-block w-6 h-6 bg-gray-200 text-center rounded mr-2 text-sm">${letter}</span>
                        ${option}
                    </div>`;
                });
            } else if (question.type === 'fill-blank') {
                html += `<div class="border-b-2 border-gray-300 w-48 h-8 mb-2"></div>`;
            } else if (question.type === 'matching') {
                html += `<div class="grid grid-cols-2 gap-4">`;
                html += `<div class="space-y-2">`;
                question.words.forEach((word, i) => {
                    html += `<div class="p-2 bg-blue-50 rounded">${i + 1}. ${word}</div>`;
                });
                html += `</div><div class="space-y-2">`;
                question.meanings.forEach((meaning, i) => {
                    const letter = String.fromCharCode(65 + i);
                    html += `<div class="p-2 bg-green-50 rounded">${letter}. ${meaning}</div>`;
                });
                html += `</div></div>`;
            }

            html += `</div>`;
        });

        html += `</div>`;
        
        testContent.innerHTML = html;
        testArea.classList.remove('hidden');
    }

    startTest() {
        this.isTestMode = true;
        this.currentQuestionIndex = 0;
        this.userAnswers = new Array(this.currentTest.questions.length).fill(null);
        
        document.getElementById('testArea').classList.add('hidden');
        document.getElementById('testExecution').classList.remove('hidden');
        document.getElementById('totalQuestions').textContent = this.currentTest.questions.length;
        
        this.displayCurrentQuestion();
    }

    displayCurrentQuestion() {
        const question = this.currentTest.questions[this.currentQuestionIndex];
        const questionArea = document.getElementById('questionArea');
        
        document.getElementById('currentQuestion').textContent = this.currentQuestionIndex + 1;
        
        let html = `
            <div class="mb-6">
                <h3 class="text-xl font-semibold mb-4">問題 ${this.currentQuestionIndex + 1}</h3>
                <p class="text-lg mb-6">${question.question}</p>
        `;

        if (question.type === 'multiple-choice') {
            html += `<div class="space-y-3">`;
            question.options.forEach((option, i) => {
                const letter = String.fromCharCode(65 + i);
                const isSelected = this.userAnswers[this.currentQuestionIndex] === option;
                html += `
                    <label class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50 border-blue-300' : 'border-gray-300'}">
                        <input type="radio" name="answer" value="${option}" class="mr-3" ${isSelected ? 'checked' : ''}>
                        <span class="font-medium mr-3">${letter}.</span>
                        <span>${option}</span>
                    </label>
                `;
            });
            html += `</div>`;
        } else if (question.type === 'fill-blank') {
            const currentAnswer = this.userAnswers[this.currentQuestionIndex] || '';
            html += `
                <input type="text" id="fillBlankAnswer" value="${currentAnswer}" 
                       class="w-full max-w-md p-3 border border-gray-300 rounded-md text-lg"
                       placeholder="答えを入力してください">
            `;
        } else if (question.type === 'matching') {
            html += `<p class="text-gray-600 mb-4">対応する番号とアルファベットを選択してください</p>`;
            // マッチング問題の詳細実装は省略（複雑なため）
        }

        html += `</div>`;
        questionArea.innerHTML = html;

        // イベントリスナーの設定
        if (question.type === 'multiple-choice') {
            document.querySelectorAll('input[name="answer"]').forEach(input => {
                input.addEventListener('change', (e) => {
                    this.userAnswers[this.currentQuestionIndex] = e.target.value;
                });
            });
        } else if (question.type === 'fill-blank') {
            document.getElementById('fillBlankAnswer').addEventListener('input', (e) => {
                this.userAnswers[this.currentQuestionIndex] = e.target.value;
            });
        }

        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        const prevBtn = document.getElementById('prevQuestion');
        const nextBtn = document.getElementById('nextQuestion');
        const finishBtn = document.getElementById('finishTest');

        prevBtn.disabled = this.currentQuestionIndex === 0;
        
        if (this.currentQuestionIndex === this.currentTest.questions.length - 1) {
            nextBtn.classList.add('hidden');
            finishBtn.classList.remove('hidden');
        } else {
            nextBtn.classList.remove('hidden');
            finishBtn.classList.add('hidden');
        }
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.displayCurrentQuestion();
        }
    }

    nextQuestion() {
        if (this.currentQuestionIndex < this.currentTest.questions.length - 1) {
            this.currentQuestionIndex++;
            this.displayCurrentQuestion();
        }
    }

    finishTest() {
        this.showResults();
    }

    showResults() {
        let correctAnswers = 0;
        const results = [];

        this.currentTest.questions.forEach((question, index) => {
            const userAnswer = this.userAnswers[index];
            const isCorrect = userAnswer === question.correctAnswer;
            
            if (isCorrect) correctAnswers++;
            
            results.push({
                question: question.question,
                userAnswer: userAnswer || '（未回答）',
                correctAnswer: question.correctAnswer,
                isCorrect: isCorrect
            });
        });

        const score = Math.round((correctAnswers / this.currentTest.questions.length) * 100);
        
        document.getElementById('testExecution').classList.add('hidden');
        
        const resultArea = document.getElementById('resultArea');
        const resultContent = document.getElementById('resultContent');
        
        let html = `
            <div class="mb-6 p-6 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-center">
                <h3 class="text-2xl font-bold mb-2">テスト完了！</h3>
                <p class="text-4xl font-bold mb-2">${score}点</p>
                <p class="text-lg">${correctAnswers} / ${this.currentTest.questions.length} 問正解</p>
            </div>

            <div class="space-y-4">
                <h4 class="text-xl font-semibold mb-4">詳細結果</h4>
        `;

        results.forEach((result, index) => {
            const bgColor = result.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
            const icon = result.isCorrect ? 'fas fa-check text-green-600' : 'fas fa-times text-red-600';
            
            html += `
                <div class="p-4 border rounded-lg ${bgColor}">
                    <div class="flex items-start gap-3">
                        <i class="${icon} text-xl mt-1"></i>
                        <div class="flex-1">
                            <h5 class="font-semibold mb-2">問題 ${index + 1}</h5>
                            <p class="mb-2">${result.question}</p>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                <div><strong>あなたの答え:</strong> ${result.userAnswer}</div>
                                <div><strong>正解:</strong> ${result.correctAnswer}</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        
        html += `
            <div class="mt-6 flex gap-4">
                <button onclick="location.reload()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium">
                    <i class="fas fa-redo mr-2"></i>
                    新しいテストを作成
                </button>
                <button onclick="window.print()" class="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-md font-medium">
                    <i class="fas fa-print mr-2"></i>
                    結果を印刷
                </button>
            </div>
        `;
        
        resultContent.innerHTML = html;
        resultArea.classList.remove('hidden');
    }

    showAnswers() {
        if (!this.currentTest) return;
        
        const testContent = document.getElementById('testContent');
        let html = `
            <div class="mb-4 p-4 bg-green-50 rounded-lg">
                <h4 class="font-semibold text-green-800 mb-2">
                    <i class="fas fa-key mr-2"></i>解答一覧
                </h4>
            </div>
            
            <div class="space-y-4">
        `;

        this.currentTest.questions.forEach((question, index) => {
            html += `
                <div class="p-4 border border-gray-200 rounded-lg bg-green-50">
                    <h5 class="font-semibold mb-2">問題 ${index + 1}</h5>
                    <p class="mb-2">${question.question}</p>
                    <div class="p-3 bg-white rounded border border-green-200">
                        <strong class="text-green-700">正解:</strong> 
                        <span class="ml-2">${question.correctAnswer}</span>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        testContent.innerHTML = html;
    }

    async generatePDF() {
        if (!this.currentTest) {
            alert('先にテストを生成してください。');
            return;
        }

        try {
            const options = {
                includeAnswers: confirm('解答も含めますか？'),
                layout: 'standard'
            };

            const response = await axios.post('/api/generate-pdf', {
                test: this.currentTest,
                options: options
            });

            if (response.data.success) {
                alert(`PDF生成が完了しました！\n\nファイル名: ${response.data.pdfData.filename}\n\n※ 実際のPDF生成機能は外部APIとの連携が必要です。`);
                
                // プレビュー用にHTMLコンテンツを新しいウィンドウで表示
                const newWindow = window.open('', '_blank');
                newWindow.document.write(response.data.pdfData.content);
                newWindow.document.close();
            }
        } catch (error) {
            console.error('PDF生成に失敗しました:', error);
            alert('PDF生成に失敗しました。');
        }
    }

    getDifficultyLabel(difficulty) {
        const labels = {
            'easy': '初級',
            'medium': '中級', 
            'hard': '上級',
            'mixed': 'ミックス'
        };
        return labels[difficulty] || difficulty;
    }

    getFormatLabel(format) {
        const labels = {
            'multiple-choice': '選択問題',
            'fill-blank': '穴埋め問題',
            'matching': 'マッチング問題'
        };
        return labels[format] || format;
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    new VocabularyTestSystem();
});

// ユーティリティ関数
function showLoading(show = true) {
    // ローディング表示の実装（必要に応じて）
}

function showNotification(message, type = 'info') {
    // 通知表示の実装（必要に応じて）
}