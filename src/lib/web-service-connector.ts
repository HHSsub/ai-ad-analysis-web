import { spawn } from 'child_process';
import * as path from 'path';

export class WebServiceConnector {
  private webServiceUrl: string;
  private apiKey?: string;

  constructor(webServiceUrl: string, apiKey?: string) {
    this.webServiceUrl = webServiceUrl;
    this.apiKey = apiKey;
  }

  async send_batch_to_web_service(batchSize: number = 10) {
    return new Promise<any>((resolve, reject) => {
      const pythonScript = path.join(process.cwd(), 'python_scripts', 'web_service_connector.py');
      const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python');
      
      const pythonProcess = spawn(venvPython, [pythonScript], {
        env: {
          ...process.env,
          WEB_SERVICE_URL: this.webServiceUrl,
          WEB_SERVICE_API_KEY: this.apiKey || '',
          PYTHONUNBUFFERED: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const lines = output.split('\n');
            const resultLine = lines.find(line => line.includes('RESULT_JSON:'));
            if (resultLine) {
              const jsonStr = resultLine.replace('RESULT_JSON:', '').trim();
              const result = JSON.parse(jsonStr);
              resolve(result);
            } else {
              resolve({
                sent: 0,
                success: 0,
                failed: 0
              });
            }
          } catch (e) {
            console.error('Failed to parse Python script output:', e);
            resolve({
              sent: 0,
              success: 0,
              failed: 0
            });
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(error);
      });

      pythonProcess.stdin.end();
    });
  }

  async check_web_service_status() {
    try {
      const response = await fetch(this.webServiceUrl, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      return response.status < 500;
    } catch (error) {
      return false;
    }
  }

  async get_analysis_results() {
    // 이 부분은 실제 API 엔드포인트가 구현되면 연결
    try {
      const response = await fetch(`${this.webServiceUrl}/api/results`, {
        headers: {
          'Authorization': this.apiKey ? `Bearer ${this.apiKey}` : '',
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error('Failed to get analysis results:', error);
      return [];
    }
  }
}
