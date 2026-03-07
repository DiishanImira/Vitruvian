'use strict';

/**
 * Signup Route
 * 
 * POST /api/signup — Creates a new member from intake form.
 * Generates initial member story via Claude, saves to files.
 */

const express = require('express');
const router = express.Router();
const memory = require('../services/memory');
const { generateInitialStory } = require('../services/story-writer');

router.post('/signup', async (req, res) => {
  const {
    name,
    phone,
    email,
    whatBroughtYou,
    howLong,
    relationship,
    partnerKnows,
    triedBefore,
    urgePattern,
    readiness,
    anythingElse,
  } = req.body;

  // Validate required fields
  if (!name || !phone) {
    return res.json({ success: false, error: 'Name and phone number are required.' });
  }

  // Normalize phone to E.164
  let normalizedPhone = phone.replace(/[^\d+]/g, '');
  if (normalizedPhone.length === 10) normalizedPhone = '+1' + normalizedPhone;
  if (normalizedPhone.length === 11 && normalizedPhone[0] !== '+') normalizedPhone = '+' + normalizedPhone;

  // Check if already exists
  const existing = memory.getMember(normalizedPhone);
  if (existing) {
    return res.json({
      success: false,
      error: 'This phone number is already registered. Just call — Gyasi remembers you.',
    });
  }

  console.log(`[signup] New member: ${name} (${normalizedPhone})`);

  // Create member in index
  const member = memory.upsertMember(normalizedPhone, {
    name,
    email: email || null,
    tier: 'foundation',
    signup: new Date().toISOString().slice(0, 10),
    calls: 0,
    lastCall: null,
    lastOutcome: null,
    daysSober: 0,
    currentModule: 0,
    status: 'new',
  });

  // Intake answers
  const intake = {
    whatBroughtYou: whatBroughtYou || '',
    howLong: howLong || '',
    relationship: relationship || '',
    partnerKnows: partnerKnows || '',
    triedBefore: triedBefore || '',
    urgePattern: urgePattern || '',
    readiness: readiness || '',
    anythingElse: anythingElse || '',
  };

  // Generate initial story via Claude
  try {
    console.log(`[signup] Generating initial story for ${name}...`);
    const story = await generateInitialStory(member, intake);
    memory.writeStory(normalizedPhone, story);
    console.log(`[signup] Story written for ${name} (${story.length} chars)`);
  } catch (err) {
    console.error(`[signup] Story generation failed:`, err.message);
    // Still succeed — they can call without a story, agent will do intake verbally
    const fallbackStory = `---
phone: "${normalizedPhone}"
name: "${name}"
tier: "foundation"
signup: "${new Date().toISOString().slice(0, 10)}"
calls: 0
last_call: null
days_clean: 0
current_module: 0
status: new
tags: [new-member, intake-pending]
---

# ${name} — New Member

Signed up via intake form. Story generation pending — intake answers available but narrative not yet written.

## Intake Answers
- What brought them here: ${intake.whatBroughtYou || 'not answered'}
- How long struggling: ${intake.howLong || 'not answered'}
- Relationship: ${intake.relationship || 'not answered'}
- Partner knows: ${intake.partnerKnows || 'not answered'}
- Tried before: ${intake.triedBefore || 'not answered'}
- Urge pattern: ${intake.urgePattern || 'not answered'}
- Readiness (1-10): ${intake.readiness || 'not answered'}
- Anything else: ${intake.anythingElse || 'not answered'}

## First Call Guidance
This is a brand new member. Warm welcome. Use the intake answers above to personalize the first conversation — don't make them repeat what they already shared. Start with what brought them here.`;

    memory.writeStory(normalizedPhone, fallbackStory);
  }

  // Return success with the phone number to call
  const callNumber = process.env.VITRUVIAN_CALL_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+15105883049';

  res.json({
    success: true,
    name,
    phone: normalizedPhone,
    callNumber,
    message: `Welcome, ${name}. Your coach Gyasi is ready. Call ${callNumber} anytime.`,
  });
});

module.exports = router;
