// server.js
// 本地 / 任意 Node 主机运行入口（不依赖 Vercel 也能跑）。
// 运行：node server.js   （默认端口 8787，可用环境变量 PORT 覆盖）
// 请求地址：http://localhost:8787/api/relay （任意路径均可，逻辑相同）
const http = require('http');
const { handleRequest } = require('./lib/core.js');

const PORT = process.env.PORT || 8787;

http
  .createServer(async function (req, res) {
    var method = (req.method || 'GET').toUpperCase();
    var body = {};
    if (method === 'POST') {
      var chunks = [];
      for await (const c of req) chunks.push(c);
      var raw = Buffer.concat(chunks).toString('utf8');
      try {
        body = JSON.parse(raw || '{}');
      } catch (e) {
        body = {};
      }
    }
    var result;
    try {
      result = await handleRequest(method, body, req.headers);
    } catch (e) {
      result = {
        status: 500,
        body: { ok: false, error: '中转站内部错误：' + (e && e.message ? e.message : e) }
      };
    }
    var headers = result.headers || {};
    Object.keys(headers).forEach(function (k) { res.setHeader(k, headers[k]); });
    res.statusCode = result.status;
    if (result.body === '' || result.body === undefined || result.body === null) {
      res.end();
    } else {
      res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body));
    }
  })
  .listen(PORT, function () {
    console.log('AI 中转站已启动：http://localhost:' + PORT + '/api/relay');
    console.log('测试命令：curl -s http://localhost:' + PORT + '/api/relay -H "Content-Type: application/json" -d "{\\"text\\":\\"周一 高数 1-2节\\",\\"token\\":\\"你的口令\\"}"');
  });
