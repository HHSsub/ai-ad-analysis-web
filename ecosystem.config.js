module.exports = {
  apps: [
    {
      name: 'youtube-ad-web',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_file: './logs/web-combined.log',
      time: true,
      // 재시작 정책 추가
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      // 환경변수 파일 로드
      env_file: '.env.local'
    },
    {
      name: 'youtube-collector',
      script: './venv/bin/python',
      args: 'youtube_ads_collector_with_db.py',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      cron_restart: '0 2 * * *',
      error_file: './logs/collector-error.log',
      out_file: './logs/collector-out.log',
      log_file: './logs/collector-combined.log',
      time: true
    },
    {
      name: 'web-connector',
      script: './venv/bin/python',
      args: 'web_service_connector.py',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      error_file: './logs/connector-error.log',
      out_file: './logs/connector-out.log',
      log_file: './logs/connector-combined.log',
      time: true
    }
  ]
};
