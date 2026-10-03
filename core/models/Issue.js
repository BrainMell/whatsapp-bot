// core/models/Issue.js
// Persistent storage for tester-reported bugs/issues/feedback.
// Multiple testers contribute to the same growing collection.
// Issues can later be sent to Groq for organization.

const mongoose = require('mongoose');

const IssueSchema = new mongoose.Schema({
  reporterId:   { type: String, required: true, index: true },  // tester's JID
  reporterName: { type: String, required: true },               // display name at time of report
  chatId:       { type: String, default: '' },                  // GC where reported
  chatName:     { type: String, default: '' },                  // GC name at time of report
  category:     { type: String, default: 'general', index: true }, // bug/balance/missing-feature/feedback/general
  severity:     { type: String, default: 'normal' },            // low/normal/high/critical
  body:         { type: String, required: true },               // the issue text
  attachments:  { type: [String], default: [] },                // optional list of context lines
  status:       { type: String, default: 'open', index: true }, // open/organized/resolved/wontfix
  submittedAt:  { type: Date, default: Date.now, index: true },
  // After Groq organization: an organized summary may be attached
  organized:    { type: String, default: null },                // null until Groq processes
  organizedAt:   { type: Date, default: null },
  organizedBy:  { type: String, default: null }                 // JID of mod who ran organize
}, { collection: 'testerIssues', timestamps: true });

IssueSchema.index({ submittedAt: -1 });
IssueSchema.index({ status: 1, submittedAt: -1 });

module.exports = mongoose.model('TesterIssue', IssueSchema);
