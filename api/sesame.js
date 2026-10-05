import { AesCmac } from 'aes-cmac';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { SESAME_UUID, SESAME_SECRET_KEY, SESAME_API_KEY } = process.env;

    if (!SESAME_UUID || !SESAME_SECRET_KEY || !SESAME_API_KEY) {
      return res.status(500).json({ error: 'Missing environment variables.' });
    }

    // 1. UNIXタイムスタンプ（秒）からメッセージ作成
    const date = Math.floor(Date.now() / 1000);
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(date, 0);
    
    // 2バイト目〜4バイト目（3バイト分）を取り出す
    const message = dateBuffer.subarray(1, 4);

    // 2. 正しい AES-CMAC 署名 (sign) の生成
    const secretKeyBuffer = Buffer.from(SESAME_SECRET_KEY, 'hex');
    const cmac = await AesCmac.aesCmac(secretKeyBuffer, message);
    const sign = cmac.toString('hex');

    // 3. 履歴 (history) の Base64 エンコード
    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    // 4. CANDY HOUSE Web API エンドポイントヘ送信
    const targetUrl = `https://app.candyhouse.co/api/sesame2/${SESAME_UUID}/cmd`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'x-api-key': SESAME_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cmd: 88, // 88: 解錠
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
