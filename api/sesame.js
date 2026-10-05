import crypto from 'crypto';

// CANDY HOUSE 公式仕様に準拠した AES-CMAC 署名計算関数
function calcCmac(secretKeyHex, messageBuffer) {
  const keyBuffer = Buffer.from(secretKeyHex, 'hex');

  // 1. ゼロブロックの暗号化
  const cipher1 = crypto.createCipheriv('aes-128-cbc', keyBuffer, Buffer.alloc(16, 0));
  cipher1.setAutoPadding(false);
  let L = cipher1.update(Buffer.alloc(16, 0));
  L = Buffer.concat([L, cipher1.final()]);

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

  // 3. パディング処理 (16バイト長へ整形)
  const paddedMessage = Buffer.alloc(16, 0);
  messageBuffer.copy(paddedMessage);
  paddedMessage[messageBuffer.length] = 0x80;

  // 4. K1 との XOR 演算
  const M_last = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    M_last[i] = paddedMessage[i] ^ K1[i];
  }

  // 5. 最終ブロック暗号化
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
    let { SESAME_UUID, SESAME_SECRET_KEY, SESAME_API_KEY } = process.env;

    if (!SESAME_UUID || !SESAME_SECRET_KEY || !SESAME_API_KEY) {
      return res.status(500).json({ error: 'Missing environment variables.' });
    }

    // 1. UUIDの空白除去および小文字化
    const cleanUuid = SESAME_UUID.trim().toLowerCase();
    const cleanSecretKey = SESAME_SECRET_KEY.trim();
    const cleanApiKey = SESAME_API_KEY.trim();

    // 2. UNIXタイムスタンプ（秒）から2〜4バイト目（3バイト分）を取得
    const date = Math.floor(Date.now() / 1000);
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(date, 0);
    const message = dateBuffer.subarray(1, 4);

    // 3. 署名 (sign) の生成
    const sign = calcCmac(cleanSecretKey, message);

    // 4. 履歴 (history) の Base64 エンコード
    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    // 5. APIエンドポイントへ送信
    const targetUrl = `https://app.candyhouse.co/api/sesame2/${cleanUuid}/cmd`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'x-api-key': cleanApiKey,
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
