// api/sesame.js
const { aesCmac } = require('node-aes-cmac');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { uuid, apiKey, secretHex, cmd, history } = req.body;

  try {
    const formattedUuid = uuid.trim().toLowerCase();
    const url = `https://app.candyhouse.co/api/sesame2/${formattedUuid}/cmd`;
    
    // 現在時刻のUnixタイムスタンプ（秒）
    const timestamp = Math.floor(Date.now() / 1000);

    // 4バイトのBufferを作成 (Little Endian)
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(timestamp, 0);

    // 【セサミ5 正解ロジック】 最初の3バイト(インデックス0?2)を取り出す
    const message = dateBuffer.slice(0, 3);

    // シークレットキー（HEX文字列）をBuffer化
    const key = Buffer.from(secretHex.trim(), 'hex');
    
    // AES-CMACで署名を計算
    const sign = aesCmac(key, message);

    const payload = {
      cmd: Number(cmd) || 88,
      history: Buffer.from(history || 'Dropin').toString('base64'),
      sign: sign
    };

    console.log("--- REQUEST DEBUG ---");
    console.log("Target URL:", url);
    console.log("Headers:", { 'x-api-key': apiKey });
    console.log("Payload:", payload);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.text();
    console.log("Response Status:", response.status);
    console.log("Response Data:", data);

    res.status(response.status).send(data);

  } catch (error) {
    console.error("Handler Error:", error);
    res.status(500).json({ error: error.message });
  }
}