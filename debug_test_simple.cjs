// シンプルなデバッグテスト実行
const http = require('http');

// HTMLページを取得
const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET'
};

console.log('🔍 サービステスト開始...');

const req = http.request(options, (res) => {
    console.log(`ステータス: ${res.statusCode}`);
    console.log(`ヘッダー: ${JSON.stringify(res.headers, null, 2)}`);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('✅ HTMLレスポンス受信完了');
        
        // HTMLにdebugPDFTest関数が含まれているかチェック
        if (data.includes('debugPDFTest')) {
            console.log('✅ debugPDFTest関数が見つかりました');
        } else {
            console.log('❌ debugPDFTest関数が見つかりません');
        }
        
        // jsPDFライブラリの読み込みをチェック
        if (data.includes('jspdf')) {
            console.log('✅ jsPDFライブラリが読み込まれています');
        } else {
            console.log('❌ jsPDFライブラリが見つかりません');
        }
        
        // Canvasの存在をチェック
        if (data.includes('textRenderingCanvas')) {
            console.log('✅ textRenderingCanvasが見つかりました');
        } else {
            console.log('❌ textRenderingCanvasが見つかりません');
        }
    });
});

req.on('error', (e) => {
    console.error(`リクエストエラー: ${e.message}`);
});

req.end();