// api/sesame.js
const { aesCmac } = require('node-aes-cmac');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { uuid, apiKey, secretHex, cmd, history } = req.body;

  try {
    const formattedUuid = uuid.toLowerCase();
    const url = `https://app.candyhouse.co/api/sesame2/${formattedUuid}/cmd`;
    
    // Unixタイムスタンプ（秒）
    const timestamp = Math.floor(Date.now() / 1000);

    // タイムスタンプをLittle Endianの4バイトBufferに変換し、下位3バイトを取り出す (セサミAPI仕様)
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(timestamp, 0);
    const message = dateBuffer.slice(1, 4);

    // シークレットキー（HEX文字列）からBufferを生成
    const key = Buffer.from(secretHex.trim(), 'hex');
    
    // AES-CMACで署名を計算
    const sign = aesCmac(key, message);

    const payload = {
      cmd: Number(cmd) || 88, // 送信されたcmd（解錠は88）
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
        'x-api-key': apiKey,
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