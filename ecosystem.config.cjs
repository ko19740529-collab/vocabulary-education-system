// PM2 Configuration for 英単語テストシステム v2.0 Premium
// PM2 Configuration for 教育用単語管理システム（共有版）
module.exports = {
  apps: [
    {
      name: 'vocabulary-education-system',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=vocabulary-education-system --local --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false, // Disable PM2 file monitoring (wrangler handles hot reload)
      instances: 1, // Development mode uses only one instance
      exec_mode: 'fork',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/output.log',
      log_file: 'logs/combined.log',
      time: true
    }
  ]
}