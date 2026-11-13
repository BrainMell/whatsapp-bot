'use strict';
const { enabled, CFG } = require('./config');
module.exports = { enabled, CFG, handle: (...a) => require('./commands').handle(...a), engine: () => require('./engine'), store: () => require('./store') };
