// デバッグテスト実行とログ取得
const puppeteer = require('puppeteer');

async function runDebugTest() {
    console.log('🔍 テスト実行開始...');
    
    let browser;
    try {
        // 軽量ブラウザ設定
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--disable-default-apps'
            ]
        });
        
        const page = await browser.newPage();
        
        // コンソールログのキャプチャ
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            console.log(`[${type.toUpperCase()}] ${text}`);
        });
        
        // エラーのキャプチャ
        page.on('pageerror', error => {
            console.error(`[ERROR] ${error.message}`);
        });
        
        // ページに移動
        console.log('📄 ページロード中...');
        await page.goto('http://localhost:3000', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        
        console.log('✅ ページロード完了');
        
        // 少し待つ
        await page.waitForTimeout(2000);
        
        // デバッグテストを実行
        console.log('🧪 デバッグテスト実行中...');
        
        const result = await page.evaluate(() => {
            try {
                if (typeof debugPDFTest === 'function') {
                    console.log('🔍 debugPDFTest関数を実行開始');
                    debugPDFTest();
                    return { success: true, message: 'debugPDFTest実行完了' };
                } else {
                    return { success: false, message: 'debugPDFTest関数が見つかりません' };
                }
            } catch (error) {
                return { success: false, message: 'エラー: ' + error.message, stack: error.stack };
            }
        });
        
        console.log('📊 実行結果:', result);
        
        // 追加で3秒待ってログを取得
        await page.waitForTimeout(3000);
        
        console.log('✅ テスト実行完了');
        
    } catch (error) {
        console.error('❌ テスト実行エラー:', error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// エラーハンドリング付きで実行
runDebugTest().catch(console.error);