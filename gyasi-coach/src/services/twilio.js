'use strict';

const twilio = require('twilio');

let client;

function getClient() {
  if (!client) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return client;
}

/**
 * Send an outbound SMS via Twilio.
 *
 * @param {string} to - recipient phone number (E.164)
 * @param {string} body - message text
 * @returns {Promise<object>} - Twilio message object
 */
async function sendSMS(to, body) {
  try {
    const message = await getClient().messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
      body,
    });
    console.log(`[twilio] SMS sent to ${to} — SID: ${message.sid}`);
    return message;
  } catch (err) {
    console.error(`[twilio] Failed to send SMS to ${to}:`, err.message);
    throw err;
  }
}

module.exports = { sendSMS };
