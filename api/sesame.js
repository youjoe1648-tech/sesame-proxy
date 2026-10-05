import crypto from 'crypto';

// AES-CMAC (Subkey生成 & 署名計算) を純粋なNode.js標準機能で実装
function generateCmac(keyBuffer, messageBuffer) {
  // 1. ゼロブロックの暗号化
  const cipher = crypto.createCipheriv('aes-128-cbc', keyBuffer, Buffer.alloc(16, 0));
  cipher.setAutoPadding(false);
  let L = cipher.update(Buffer.alloc(16, 0));
  L = Buffer.concat([L, cipher.final()]);

  // Subkey 1 (K1) の生成
  const const_Rb = Buffer.from('00000000000000000000000000000087', 'hex');
  let K1 = Buffer.alloc(16);
  let carry = 0;
  for (let i = 15; i >= 0; i--) {
    const byte = L[i];
    K1[i] = ((byte << 1) & 0xff) | carry;
    carry = (byte & 0x80) ? 1 : 0;
  }
  if (L[0] & 0x80) {
    for (let i = 0; i < 16; i++) K1[i] ^= const_Rb[i];
  }

  // ブロック長（16バイト未満）の補正処理 (Padding)
  const paddedMessage = Buffer.alloc(16, 0);
  messageBuffer.copy(paddedMessage);
  paddedMessage[messageBuffer.length] = 0x80;

  // 最終ブロックと K1 の XOR
  const M_last = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) {
    M_last[i] = paddedMessage[i] ^ K1[i];
  }

  // 最終CBC暗号化
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

    // 1. タイムスタンプ取得とメッセージ（3バイト）の抽出
    const date = Math.floor(Date.now() / 1000);
    const dateBuffer = Buffer.alloc(4);
    dateBuffer.writeUInt32LE(date, 0);
    const message = dateBuffer.subarray(1, 4);

    // 2. AES-CMAC 署名計算
    const secretKeyBuffer = Buffer.from(SESAME_SECRET_KEY, 'hex');
    const sign = generateCmac(secretKeyBuffer, message);

    // 3. 履歴のBase64エンコード
    const historyText = req.body?.history || 'WebUnlock';
    const historyBase64 = Buffer.from(historyText, 'utf-8').toString('base64');

    // 4. CANDY HOUSE Web API エンドポイント送信
    const targetUrl = `https://app.candyhouse.co/api/sesame2/${SESAME_UUID}/cmd`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'x-api-key': SESAME_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cmd: 88,
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
