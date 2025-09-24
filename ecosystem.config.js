module.exports = {
  apps: [
    {
      name: 'youtube-ad-web',
      script: 'npm',
      args: 'start',
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
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'youtube-collector',
      script: './venv/bin/python',
      args: './python_scripts/youtube_ads_collector_with_db.py',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      cron_restart: '0 2 * * *',
      error_file: './logs/collector-error.log',
      out_file: './logs/collector-out.log',
      log_file: './logs/collector-combined.log',
      time: true,
      env: {
        SERPAPI_KEY: '646e6386e54a3e331122aa9460166830bcdbd35c89283b857dcf66901e11db2a',
        PYTHONPATH: './python_scripts'
      }
    },
    {
      name: 'web-connector',
      script: './venv/bin/python',
      args: './python_scripts/web_service_connector.py',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      error_file: './logs/connector-error.log',
      out_file: './logs/connector-out.log',
      log_file: './logs/connector-combined.log',
      time: true,
      env: {
        WEB_SERVICE_URL: 'http://localhost:3000',
        PYTHONPATH: './python_scripts'
      }
    }
  ]
};
