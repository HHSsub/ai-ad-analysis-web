import { google } from 'googleapis';
import { createPrivateKey } from 'node:crypto';
import fetch from 'node-fetch';

function stripOuterQuotes(s = '') {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}
function normalizePrivateKey(k = '') {
  let s = stripOuterQuotes(k);
  for (let i = 0; i < 3; i++) {
    const prev = s;
    s = s.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    if (s === prev) break;
  }
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '').replace(/^\uFEFF/, '').trim();
  if (!s.endsWith('\n')) s += '\n';
  return s;
}

function parseCreds() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (raw && raw.trim()) {
    try {
      const obj = JSON.parse(stripOuterQuotes(raw));
      return {
        client_email: obj.client_email,
        private_key: normalizePrivateKey(obj.private_key || ''),
        private_key_id: obj.private_key_id,
        source: 'JSON'
      };
    } catch (e) {
      console.warn('[verify] CREDENTIALS JSON parse failed:', e.message);
    }
  }
  return {
    client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    private_key: normalizePrivateKey(process.env.GOOGLE_DRIVE_PRIVATE_KEY || ''),
    private_key_id: stripOuterQuotes(process.env.GOOGLE_DRIVE_PRIVATE_KEY_ID || ''),
    source: 'FALLBACK'
  };
}

(async () => {
  const creds = parseCreds();
  if (!creds.client_email || !creds.private_key) {
    console.error('Missing client_email/private_key');
    process.exit(1);
  }
  console.log(`[verify] source=${creds.source}, email=${creds.client_email}, kid=${creds.private_key_id || '(none)'}`);

  // 1) PEM 파싱 검증
  try {
    createPrivateKey({ key: creds.private_key, format: 'pem' });
    console.log('[verify] PEM parse: OK');
  } catch (e) {
    console.error('[verify] PEM parse FAILED:', e.message);
    process.exit(1);
  }

  // 2) 서비스 계정 활성 공개키 목록 조회(키 ID 리스트)
  try {
    const url = `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(creds.client_email)}`;
    const res = await fetch(url);
    const json = await res.json();
    const kids = Object.keys(json);
    console.log('[verify] Active public key IDs on Google:', kids);
    if (creds.private_key_id) {
      if (!kids.includes(creds.private_key_id)) {
        console.warn(`[verify] WARNING: Your private_key_id (${creds.private_key_id}) is NOT in active keys. Likely deleted/rotated.`);
      } else {
        console.log('[verify] private_key_id is active on Google.');
      }
    } else {
      console.log('[verify] No private_key_id provided; auth may still work if signature matches one of the active keys.');
    }
  } catch (e) {
    console.warn('[verify] Could not fetch x509 keys:', e.message);
  }

  // 3) 실제 토큰 발급
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
        private_key_id: creds.private_key_id,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    const token = await auth.getAccessToken();
    console.log('[verify] Access token OK:', token ? 'received' : 'none');
  } catch (e) {
    console.error('[verify] Access token FAILED:', e.response?.data?.error_description || e.message || e);
    process.exit(1);
  }
})();