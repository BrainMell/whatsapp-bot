'use strict';

const core = require('./system');
const defaultSystem = core.createSummonCardSystem(require('../economy/economy'));

module.exports = {
  ...defaultSystem,
  ...core,
};
