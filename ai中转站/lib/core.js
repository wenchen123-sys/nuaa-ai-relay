// lib/core.js
// AI 中转站核心逻辑（与部署平台无关，Vercel / 自建 Node 服务器共用）。
//
// 作用：小程序前端不能直连大模型 API（密钥写在客户端会被反编译泄露），
// 所以由本服务端持有密钥，代小程序把「杂乱的课表文本」整理成「规整 CSV」。
//
// 链路：小程序 -> 中转站（本服务，免费部署在 Vercel） -> 大模型（默认智谱 GLM-4-Flash，免费）
//
// 请求：POST { text: "课表文本", token: "访问口令(选填)" }
// 返回：{ ok: true, csv: "课程名,星期,节次,地点,教师,周次\n...", model: "glm-4-flash" }
//       或 { ok: false, error: "错误原因" }

// 给大模型的系统提示词：把任意格式的课表文本转成严格 CSV
var SYSTEM_PROMPT = [
  '你是课程表结构化助手。用户会给你一段课表文本，可能是自由文本、OCR 识别结果、表格文字或杂乱笔记，格式不固定。',
  '请把其中每一门课提取出来，输出为严格的 CSV 文本。',
  'CSV 固定列为：课程名,星期,节次,地点,教师,周次',
  '规则：',
  '1. 星期用数字 1-7，1 表示周一；',
  '2. 节次写成起止节，如 1-2；单节直接写数字如 5；如果原文给的是时间（如 08:00-09:40），按中国大学常见作息推算节次，推不出就留空；',
  '3. 周次：每周都上写 all；只有单周上写 odd；只有双周上写 even；如 1-16 这样的具体周次范围直接照写；',
  '4. 地点、教师没有就留空，但每行逗号数量必须固定为 5 个；',
  '5. 一门课输出一行，顺序保持原文顺序；识别不出的内容直接跳过；',
  '6. 课程名保留原文，不要翻译、改写或补充；',
  '7. 只输出 CSV 数据行，不要表头说明，不要任何解释文字，不要 Markdown 代码块。'
].join('\n');

function getEnv(name, fallback) {
  var v = process.env[name];
  return v === undefined || v === null || v === '' ? fallback : v;
}

// 去掉 AI 可能带出的 Markdown 代码块围栏、BOM、空行，只保留含逗号的 CSV 行
function cleanCsv(s) {
  if (!s) return '';
  var out = String(s).replace(/^\\uFEFF/, '').trim();
  out = out.replace(/^```[a-zA-Z]*\s*/g, '').replace(/```\s*$/g, '');
  var lines = out.split(/\r?\n/).map(function (l) { return l.trim(); })
    .filter(function (l) { return l.indexOf(',') >= 0; });
  return lines.join('\n');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Token'
  };
}

function json(status, obj) {
  return {
    status: status,
    body: obj,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, corsHeaders())
  };
}

// 统一请求处理：method 大写，body 为已解析的对象，headers 为原始请求头
async function handleRequest(method, body, headers) {
  method = (method || 'POST').toUpperCase();
  if (method === 'OPTIONS') {
    return { status: 204, body: '', headers: corsHeaders() };
  }
  if (method !== 'POST') {
    return json(405, { ok: false, error: '仅支持 POST 请求' });
  }

  var text = body && typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return json(400, { ok: false, error: '缺少参数 text（课表文本）' });
  }
  if (text.length > 20000) {
    return json(400, { ok: false, error: '文本过长（上限 20000 字），请分批导入' });
  }

  // 口令校验：部署时设置了 RELAY_TOKEN 才启用，防止别人蹭免费额度
  var relayToken = getEnv('RELAY_TOKEN', '');
  var token = (body && body.token) || (headers && (headers['x-relay-token'] || headers['X-Relay-Token'])) || '';
  if (relayToken && token !== relayToken) {
    return json(401, { ok: false, error: '访问口令不正确，请检查小程序设置页填写的中转口令' });
  }

  var apiKey = getEnv('LLM_API_KEY', '');
  if (!apiKey) {
    return json(500, {
      ok: false,
      error: '中转站未配置 LLM_API_KEY 环境变量，请按 README.md 的部署说明设置后重新部署'
    });
  }

  var baseUrl = getEnv('LLM_BASE_URL', 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
  var model = getEnv('LLM_MODEL', 'glm-4-flash');

  var upstream;
  try {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 60000);
    var resp = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.1,
        max_tokens: Math.min(4000, 500 + Math.ceil(text.length / 2)),
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text }
        ]
      })
    });
    clearTimeout(timer);
    var raw = await resp.text();
    if (!resp.ok) {
      var msg = '大模型接口报错 HTTP ' + resp.status;
      try {
        var errJson = JSON.parse(raw);
        if (errJson.error && errJson.error.message) msg += '：' + errJson.error.message;
      } catch (e) { /* 忽略解析失败，用默认信息 */ }
      return json(502, { ok: false, error: msg });
    }
    upstream = JSON.parse(raw);
  } catch (e) {
    var isAbort = e && e.name === 'AbortError';
    return json(504, {
      ok: false,
      error: isAbort ? '大模型响应超时（60 秒），请稍后重试' : '连接大模型失败：' + (e && e.message ? e.message : e)
    });
  }

  var csv = cleanCsv(
    upstream && upstream.choices && upstream.choices[0] && upstream.choices[0].message
      ? upstream.choices[0].message.content
      : ''
  );
  if (!csv || csv.indexOf(',') < 0) {
    return json(502, { ok: false, error: 'AI 未返回有效课表，请检查原文或重试' });
  }
  return json(200, { ok: true, csv: csv, model: model });
}

module.exports = { handleRequest: handleRequest, SYSTEM_PROMPT: SYSTEM_PROMPT, cleanCsv: cleanCsv };
