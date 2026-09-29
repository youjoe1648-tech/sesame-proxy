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

    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(timestamp, 0);
    const message = dateBuffer.slice(1, 4);

    const key = Buffer.from(secretHex, 'hex');
    const sign = aesCmac(key, message);

    const payload = {
      cmd: Number(cmd),
      history: Buffer.from(history || 'Dropin').toString('base64'),
      sign: sign
    };

    // デバッグログ出力（Vercelの管理画面で確認可能）
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