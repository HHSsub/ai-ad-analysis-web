module.exports = {
  apps: [
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
        GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID
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
  ]
};
