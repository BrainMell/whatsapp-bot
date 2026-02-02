const mongoose = require('mongoose');

const SystemSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // e.g., 'blocked_users', 'muted_users', 'group_settings'
    value: { type: mongoose.Schema.Types.Mixed, required: true } // Flexible data
}, { timestamps: true });

module.exports = mongoose.model('System', SystemSchema);
