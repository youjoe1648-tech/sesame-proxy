import crypto from 'crypto';

// 外部ライブラリに頼らず Node.js 標準機能のみで AES-CMAC を計算する関数
function generateCmac(keyBuffer, messageBuffer) {
  // 1. ゼロブロックを暗号化して L を取得
  const cipher = crypto.createCipheriv('aes-128-cbc', keyBuffer, Buffer.alloc(16, 0));
  cipher.setAutoPadding(false);
  let L = cipher.update(Buffer.alloc(16, 0));
  L = Buffer.concat([L, cipher.final()]);

  // 2. Subkey (K1) の生成
  const const_Rb = Buffer.from('00000000000000000000000000000087', 'hex');
  let K1 = Buffer.alloc(16);
  let carry = 0;
  for (let i = 15; i >= 0; i--) {
    const byte = L[i];
    K1[i] = ((byte << 1) & 0xff) | carry;
    carry = (byte & 0x80) ? 1 : 0;
  }
  if (L[0] & 0x80) {
    for (let i = 0; i < 16; i++) {
      K1[i] ^= const_Rb[i];
    }
  }

  // 3. パディング処理 (16バイト長にする)
  const paddedMessage = Buffer.alloc(16, 0);
  messageBuffer.copy(paddedMessage);
  paddedMessage[messageBuffer.length] = 0x80;

  // 4. K1 と XOR 演算
  const M_last = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    M_last[i] = paddedMessage[i] ^ K1[i];
  }

  // 5. 最終ブロックを暗号化
  const macCipher = crypto.createCipheriv('aes-128-cbc', keyBuffer, Buffer.alloc(16, 0));
  macCipher.setAutoPadding(false);
  let mac = macCipher.update(M_last);
  mac = Buffer.concat([mac, macCipher.final()]);

  return mac.toString('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { SESAME_UUID, SESAME_SECRET_KEY, SESAME_API_KEY } = process.env;

    if (!SESAME_UUID || !SESAME_SECRET_KEY || !SESAME_API_KEY) {
      return res.status(500).json({ error: 'Missing environment variables.' });
    }

    // 1. UNIXタイムスタンプから3バイトのメッセージ（2〜4バイト目）を抽出
    const date = Math.floor(Date.now() / 1000);
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(date, 0);
    const message = dateBuffer.subarray(1, 4);

    // 2. 自前実装の AES-CMAC で正確な署名 (sign) を生成
    const secretKeyBuffer = Buffer.from(SESAME_SECRET_KEY, 'hex');
    const sign = generateCmac(secretKeyBuffer, message);

    // 3. 履歴 (history) の Base64 エンコード
    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    // 4. セサミ5 / 5 Pro 用の正しい Web API エンドポイント
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
