import { aesCmac } from 'aes-cmac';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { SESAME_UUID, SESAME_SECRET_KEY, SESAME_API_KEY } = process.env;

    if (!SESAME_UUID || !SESAME_SECRET_KEY || !SESAME_API_KEY) {
      return res.status(500).json({ error: 'Missing environment variables.' });
    }

    // 1. UNIXタイムスタンプ（秒）から3バイトのメッセージ（2〜4バイト目）を抽出
    const date = Math.floor(Date.now() / 1000);
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(date, 0);
    const message = dateBuffer.subarray(1, 4);

    // 2. aes-cmac ライブラリによる正しい暗号署名（sign）の生成
    // (aesCmac は同期関数で HEX 文字列を返します)
    const sign = aesCmac(SESAME_SECRET_KEY, message);

    // 3. 履歴（history）の Base64 エンコード
    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    // 4. CANDY HOUSE Web API エンドポイントへ送信
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
