'use strict';

const { PranaDevice } = require('./device');
const { PranaClient } = require('./client');
const PLUGIN = 'homebridge-prana-local';
const PLATFORM = 'PranaLocal';

class PranaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.cached = [];
    this.controllers = [];
    api.on('didFinishLaunching', () => this.launch());
    api.on('shutdown', () => this.controllers.forEach(device => device.stop()));
  }

  configureAccessory(accessory) { this.cached.push(accessory); }

  saveAccessory(accessory) {
    if (this.cached.includes(accessory)) this.api.updatePlatformAccessories([accessory]);
    else {
      this.api.registerPlatformAccessories(PLUGIN, PLATFORM, [accessory]);
      this.cached.push(accessory);
    }
  }

  async launch() {
    if (!Array.isArray(this.config.devices)) {
      this.log.warn('Configure at least one Prana in the devices list');
      return;
    }
    const used = new Set();
    for (const config of this.config.devices) {
      try {
        new PranaClient(config.host, config.port ?? 80);
        const id = config.id || config.host;
        const uuid = this.api.hap.uuid.generate(`${PLUGIN}:${id}`);
        if (used.has(uuid)) throw new Error('Duplicate device id or host');
        used.add(uuid);
        const accessory = this.cached.find(a => a.UUID === uuid) || new this.api.platformAccessory(config.name || 'Prana ventilation', uuid);
        const device = new PranaDevice(this, config, accessory);
        this.controllers.push(device);
        await device.start();
      } catch (error) { this.log.error(`Prana configuration: ${error.message}`); }
    }
    const removed = this.cached.filter(a => !used.has(a.UUID));
    if (removed.length) this.api.unregisterPlatformAccessories(PLUGIN, PLATFORM, removed);
  }
}

module.exports = { PranaPlatform };
