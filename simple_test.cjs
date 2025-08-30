// シンプルなテスト実行
const puppeteer = require('puppeteer');

async function simpleTest() {
    console.log('🔍 シンプルテスト開始...');
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox']
        });
        
        const page = await browser.newPage();
        
        // ログをキャプチャ
        page.on('console', msg => console.log(`[${msg.type()}] ${msg.text()}`));
        page.on('pageerror', error => console.error(`[ERROR] ${error.message}`));
        
        // ページロード
        await page.goto('http://localhost:3000', { waitUntil: 'load' });
        console.log('✅ ページロード完了');
        
        // 2秒待つ
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // デバッグテスト実行
        console.log('🧪 デバッグテスト実行...');
        
        const result = await page.evaluate(() => {
            if (typeof debugPDFTest === 'function') {
                console.log('🔍 debugPDFTest実行開始');
                debugPDFTest();
                return 'debugPDFTest実行完了';
            }
            return 'debugPDFTest関数が見つかりません';
        });
        
        console.log('📊 結果:', result);
        
        // 5秒待ってログ収集
        await new Promise(resolve => setTimeout(resolve, 5000));
        
    } catch (error) {
        console.error('❌ エラー:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

simpleTest();