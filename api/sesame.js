import crypto from 'crypto';

// CANDY HOUSE公式（RFC 4493）準拠の完全なAES-CMAC計算
function generateCmac(secretKeyHex, messageBuffer) {
  const keyBuffer = Buffer.from(secretKeyHex, 'hex');

  // 1. ゼロブロック暗号化
  const cipher1 = crypto.createCipheriv('aes-128-cbc', keyBuffer, Buffer.alloc(16, 0));
  cipher1.setAutoPadding(false);
  let L = cipher1.update(Buffer.alloc(16, 0));
  L = Buffer.concat([L, cipher1.final()]);

  const const_Rb = Buffer.from('00000000000000000000000000000087', 'hex');

  // 2. K1の生成
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

  // 3. K2の生成（← ここが完全に欠落していました）
  let K2 = Buffer.alloc(16);
  carry = 0;
  for (let i = 15; i >= 0; i--) {
    const byte = K1[i];
    K2[i] = ((byte << 1) & 0xff) | carry;
    carry = (byte & 0x80) ? 1 : 0;
  }
  if (K1[0] & 0x80) {
    for (let i = 0; i < 16; i++) {
      K2[i] ^= const_Rb[i];
    }
  }

  // 4. メッセージ（3バイト）のパディング処理
  const paddedMessage = Buffer.alloc(16, 0);
  messageBuffer.copy(paddedMessage);
  paddedMessage[messageBuffer.length] = 0x80;

  // 5. データ長が16バイト未満のため「K2」とXOR演算（K1ではない）
  const M_last = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    M_last[i] = paddedMessage[i] ^ K2[i];
  }

  // 6. 最終暗号化
  const cipher2 = crypto.createCipheriv('aes-128-cbc', keyBuffer, Buffer.alloc(16, 0));
  cipher2.setAutoPadding(false);
  let mac = cipher2.update(M_last);
  mac = Buffer.concat([mac, cipher2.final()]);

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

    const cleanUuid = SESAME_UUID.trim().toUpperCase();
    const cleanSecretKey = SESAME_SECRET_KEY.trim();
    const cleanApiKey = SESAME_API_KEY.trim();

    // UNIXタイムスタンプ（秒）を取得
    const date = Math.floor(Date.now() / 1000);
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(date, 0);
    
    // 2〜4バイト目（3バイト分）を抽出
    const message = dateBuffer.subarray(1, 4);

    // K2を用いた正しい暗号署名の生成
    const sign = generateCmac(cleanSecretKey, message);

    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    const targetUrl = `https://app.candyhouse.co/api/sesame2/${cleanUuid}/cmd`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'x-api-key': cleanApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cmd: 88,
        history: historyBase64,
        sign: sign,
      }),
    });

    // 空のレスポンスボディが返ってきた際のエラー回避
    const responseText = await response.text();
    let responseData = {};
    try {
      if (responseText) responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = { text: responseText };
    }

    return res.status(200).json({
      statusCode: response.status,
      candyHouseResponse: responseData,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unknown Error' });
  }
}
