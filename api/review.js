// Vercel Serverless Function — Anthropic API 프록시
// 주의: Next.js가 아닌 순수 Vercel Function이므로 `export const config`는 동작하지 않습니다.
//       요청 바디 한도(약 4.5MB)는 플랫폼 제한이며 코드로 늘릴 수 없습니다.
//       프레임 용량은 프론트엔드(FRAME_CONFIG.MAX_PAYLOAD_BYTES)에서 제어합니다.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'ok' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY 환경변수가 없습니다. Vercel → Settings → Environment Variables 확인 후 Redeploy 해주세요.'
    });
  }

  if (!req.body || !req.body.messages) {
    return res.status(400).json({ error: '요청 본문이 비어 있거나 형식이 올바르지 않습니다.' });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const text = await upstream.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: `Anthropic 응답을 해석할 수 없습니다: ${text.slice(0, 200)}`
      });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `Anthropic API 오류 (${upstream.status})`
      });
    }

    return res.status(200).json(data);

  } catch (e) {
    const msg = String(e?.message || e);
    if (/timeout|aborted|ETIMEDOUT/i.test(msg)) {
      return res.status(504).json({
        error: '분석 시간이 초과되었습니다. 영상 길이를 줄이거나 Transcript만으로 재시도해주세요.'
      });
    }
    return res.status(500).json({ error: msg || '서버 오류' });
  }
}
