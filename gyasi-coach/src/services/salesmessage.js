'use strict';

/**
 * SalesMessage outbound client.
 *
 * POST https://api.salesmessage.com/pub/v2.2/messages/{conversation_id}
 * Header: Authorization: Bearer <PAT>
 * Body:   { message: "text to send" }
 *
 * The conversation_id is handed to us on inbound webhook payloads
 * (data.message.conversation_id), so no contact lookup is needed.
 */

const https = require('https');

const BASE_HOST = 'api.salesmessage.com';
const BASE_PATH = '/pub/v2.2';

function postJson(pathname, token, body) {
  const payload = JSON.stringify(body);
  const options = {
    hostname: BASE_HOST,
    path: pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (_) { /* leave null */ }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: parsed, raw: data });
        } else {
          const err = new Error(`SalesMessage ${res.statusCode}: ${data || '(empty)'}`);
          err.status = res.statusCode;
          err.body = parsed;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendMessageToConversation(conversationId, text) {
  const token = process.env.SALESMESSAGE_PAT;
  if (!token) throw new Error('SALESMESSAGE_PAT not set');
  if (!conversationId) throw new Error('conversation_id required');
  if (!text) throw new Error('message required');
  return postJson(`${BASE_PATH}/messages/${conversationId}`, token, { message: text });
}

module.exports = { sendMessageToConversation };
