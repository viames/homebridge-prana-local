'use strict';

const { PranaPlatform } = require('./lib/platform');
module.exports = api => api.registerPlatform('homebridge-prana-local', 'PranaLocal', PranaPlatform);
