import crypto from 'crypto';
import https from 'https';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { SESAME_UUID, SESAME_SECRET_KEY, SESAME_API_KEY } = process.env;

    if (!SESAME_UUID || !SESAME_SECRET_KEY || !SESAME_API_KEY) {
      return res.status(500).json({ error: 'Missing environment variables.' });
    }

    // 1. AES-CMAC 署名（sign）の生成
    const date = Math.floor(Date.now() / 1000);
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(date, 0);
    const message = dateBuffer.subarray(1, 4);

    const secretKeyBuffer = Buffer.from(SESAME_SECRET_KEY, 'hex');

    const cipher = crypto.createCipheriv('aes-128-cbc', secretKeyBuffer, Buffer.alloc(16, 0));
    cipher.setAutoPadding(false);
    let cmac = cipher.update(Buffer.concat([message, Buffer.alloc(13, 0)]));
    cmac = Buffer.concat([cmac, cipher.final()]);
    const sign = cmac.subarray(0, 16).toString('hex');

    // 2. 履歴（history）のBase64エンコード
    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    // 3. 送信ペイロードの準備
    const postData = JSON.stringify({
      cmd: 88,
      history: historyBase64,
      sign: sign,
    });

    // 4. セサミ5（API v3）の正しいドメインへ送信
    const options = {
      hostname: 'ssm3.openlock.cc',
      port: 443,
      path: `/api/shadow/sesame/${SESAME_UUID}`,
      method: 'POST',
      headers: {
        'x-api-key': SESAME_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const responseData = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let body = '';
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () => {
          try {
            resolve({ status: response.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: response.statusCode, data: body });
          }
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.write(postData);
      request.end();
    });

    return res.status(200).json({
      statusCode: responseData.status,
      data: responseData.data,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Request failed' });
  }
}
