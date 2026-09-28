// api/sesame.js
const { aesCmac } = require('node-aes-cmac');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { uuid, apiKey, secretHex, cmd, history } = req.body;

  try {
    const url = `https://app.candyhouse.co/api/sesame2/${uuid}/cmd`;
    const timestamp = Math.floor(Date.now() / 1000);

    // タイムスタンプの1?3バイト目を抽出
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(timestamp, 0);
    const message = dateBuffer.slice(1, 4);

    // 公式ライブラリによる確実な AES-CMAC 署名計算
    const key = Buffer.from(secretHex, 'hex');
    const sign = aesCmac(key, message);

    // セサミAPIへ送信
    const payload = {
      cmd: cmd,
      history: Buffer.from(history).toString('base64'),
      sign: sign
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.text();
    res.status(response.status).send(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}