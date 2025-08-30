// デバッグテスト実行スクリプト
const puppeteer = require('puppeteer');

async function runDebugTest() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // コンソールログをキャプチャ
        page.on('console', msg => {
            console.log(`[${msg.type()}] ${msg.text()}`);
        });
        
        // エラーをキャプチャ
        page.on('pageerror', error => {
            console.error(`[PAGE ERROR] ${error.message}`);
        });
        
        // ページにアクセス
        await page.goto('http://localhost:3000', { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        
        console.log('ページロード完了');
        
        // デバッグボタンをクリック
        await page.evaluate(() => {
            if (typeof debugPDFTest === 'function') {
                console.log('🔍 デバッグテスト実行開始');
                debugPDFTest();
                console.log('🔍 デバッグテスト関数呼び出し完了');
            } else {
                console.error('❌ debugPDFTest関数が見つかりません');
            }
        });
        
        // 少し待ってログを取得
        await page.waitForTimeout(5000);
        console.log('デバッグテスト実行完了');
        
    } catch (error) {
        console.error('テスト実行エラー:', error);
    } finally {
        await browser.close();
    }
}

runDebugTest();