import crypto from 'crypto';

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
    
    // dateBufferの2バイト目〜4バイト目（3バイト分）を使用
    const message = dateBuffer.slice(1, 4);

    const secretKeyBuffer = Buffer.from(SESAME_SECRET_KEY, 'hex');

    // Node.js crypto を使用した AES-CMAC 計算
    const cipher = crypto.createCipheriv('aes-128-cbc', secretKeyBuffer, Buffer.alloc(16, 0));
    cipher.setAutoPadding(false);
    let cmac = cipher.update(Buffer.concat([message, Buffer.alloc(13, 0)]));
    cmac = Buffer.concat([cmac, cipher.final()]);
    const sign = cmac.slice(0, 16).toString('hex');

    // 2. 履歴（history）のBase64エンコード
    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    // 3. セサミ5用 API v3 エンドポイントへ送信
    // URLを ssm3.candyhouse.co/api/shadow/sesame/... に変更
    const targetUrl = `https://ssm3.candyhouse.co/api/shadow/sesame/${SESAME_UUID}`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'x-api-key': SESAME_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cmd: 88, // 88: 解錠 (Toggle/Unlock)
        history: historyBase64,
        sign: sign,
      }),
    });

    const responseData = await response.json();
    return res.status(200).json({ statusCode: response.status, data: responseData });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
