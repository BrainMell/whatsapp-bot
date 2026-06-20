const mongoose = require('mongoose');

const LidMappingSchema = new mongoose.Schema({
    lid: { type: String, required: true, unique: true }, // e.g., '1234567890' (without @lid)
    phone: { type: String, required: true }             // e.g., '233201487480' (without @s.whatsapp.net)
}, { timestamps: true });

module.exports = mongoose.model('LidMapping', LidMappingSchema);
