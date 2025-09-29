// ecosystem.config.js - 기존 시스템 완전 유지 + SQL 옵션 추가
module.exports = {
  apps: [
    // 기존 웹 서비스 (변경 없음)
    {
      name: 'web',
      script: 'npm',
      args: 'start',
      cwd: '/home/ubuntu/projects/ai-ad-analysis-web',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        SERPAPI_KEY: process.env.SERPAPI_KEY || '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a',
        GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID,
        GOOGLE_SERVICE_ACCOUNT_CREDENTIALS: process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS,
        GOOGLE_DRIVE_CLIENT_EMAIL: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
        GOOGLE_DRIVE_PRIVATE_KEY: process.env.GOOGLE_DRIVE_PRIVATE_KEY
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: '/home/ubuntu/.pm2/logs/web-error.log',
      out_file: '/home/ubuntu/.pm2/logs/web-out.log',
      log_file: '/home/ubuntu/.pm2/logs/web-combined.log',
      time: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    
    // 기존 자동 워크플로우 (변경 없음)
    {
      name: 'auto-workflow',
      script: './auto_workflow.sh',
      args: 'start',
      cwd: '/home/ubuntu/projects/ai-ad-analysis-web',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '2G',
      error_file: '/home/ubuntu/.pm2/logs/auto-workflow-error.log',
      out_file: '/home/ubuntu/.pm2/logs/auto-workflow-out.log',
      log_file: '/home/ubuntu/.pm2/logs/auto-workflow-combined.log',
      time: true,
      env: {
        SERPAPI_KEY: '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a',
        WEB_SERVICE_URL: 'http://localhost:3000',
        PYTHONPATH: './python_scripts',
        PYTHONUNBUFFERED: '1'
      },
      restart_delay: 60000,
      max_restarts: 999,
      min_uptime: '30s'
    }
    
    // SQL 스케줄러는 선택 사항 - 필요시 주석 제거
    /*
    {
      name: 'sql-scheduler',
      script: './scripts/full-auto-scheduler-sql.js',
      args: 'schedule',
      cwd: '/home/ubuntu/projects/ai-ad-analysis-web',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '2G',
      error_file: '/home/ubuntu/.pm2/logs/sql-scheduler-error.log',
      out_file: '/home/ubuntu/.pm2/logs/sql-scheduler-out.log',
      log_file: '/home/ubuntu/.pm2/logs/sql-scheduler-combined.log',
      time: true,
      env: {
        WEB_SERVICE_URL: 'http://localhost:3000',
        SERPAPI_KEY: '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a',
        PYTHONPATH: './python_scripts',
        PYTHONUNBUFFERED: '1',
        NODE_ENV: 'production'
      },
      restart_delay: 60000,
      max_restarts: 999,
      min_uptime: '30s'
    }
    */
  ]
};
