// api/relay.js
// Vercel Serverless Function 入口。
// 部署后访问地址：https://你的域名/api/relay
// 逻辑全部在 ../lib/core.js，本文件只做 Vercel req/res 适配。
const { handleRequest } = require('../lib/core.js');

module.exports = async function handler(req, res) {
  var method = (req.method || 'POST').toUpperCase();
  var body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch (e) {
      body = {};
    }
  }
  var result;
  try {
    result = await handleRequest(method, body || {}, req.headers || {});
  } catch (e) {
    result = {
      status: 500,
      body: { ok: false, error: '中转站内部错误：' + (e && e.message ? e.message : e) }
    };
  }
  var headers = result.headers || {};
  Object.keys(headers).forEach(function (k) { res.setHeader(k, headers[k]); });
  res.status(result.status);
  if (result.body === '' || result.body === undefined || result.body === null) {
    res.end();
  } else {
    res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
  }
};
