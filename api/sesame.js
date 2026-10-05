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

    // 1. AES-CMAC 署名 (sign) の生成
    const date = Math.floor(Date.now() / 1000);
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(date, 0);
    
    // dateBuffer の 2〜4バイト目（3バイト分）を取得
    const message = dateBuffer.subarray(1, 4);

    const secretKeyBuffer = Buffer.from(SESAME_SECRET_KEY, 'hex');

    // AES-128-CBC を使用した CMAC 計算
    const cipher = crypto.createCipheriv('aes-128-cbc', secretKeyBuffer, Buffer.alloc(16, 0));
    cipher.setAutoPadding(false);
    let cmac = cipher.update(Buffer.concat([message, Buffer.alloc(13, 0)]));
    cmac = Buffer.concat([cmac, cipher.final()]);
    const sign = cmac.subarray(0, 16).toString('hex');

    // 2. 履歴 (history) の Base64 エンコード
    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    // 3. CANDY HOUSE Web API エンドポイント（正解のURL）
    const targetUrl = `https://app.candyhouse.co/api/sesame2/${SESAME_UUID}/cmd`;

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

    return res.status(200).json({
      statusCode: response.status,
      candyHouseResponse: responseData,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unknown Error' });
  }
}
