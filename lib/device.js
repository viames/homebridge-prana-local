'use strict';

const { PranaClient, speedPercent, speedCommand, SWITCH_TYPES } = require('./client');

const WORDS = {
  en: { auto: 'Automatic', auto_plus: 'Quiet automatic', night: 'Night', boost: 'Boost', bound: 'Balanced airflow', winter: 'Winter', heater: 'Mini heater', supply: 'Supply', extract: 'Extract', inside_temperature: 'Indoor temperature', outside_temperature: 'Outdoor temperature', inside_temperature_2: 'Supply temperature', outside_temperature_2: 'Exhaust temperature', humidity: 'Humidity', co2: 'Equivalent CO2' },
  it: { auto: 'Automatico', auto_plus: 'Automatico silenzioso', night: 'Notte', boost: 'Ricambio forzato', bound: 'Flussi sincronizzati', winter: 'Modalità inverno', heater: 'Mini riscaldamento', supply: 'Immissione', extract: 'Estrazione', inside_temperature: 'Temperatura interna', outside_temperature: 'Temperatura esterna', inside_temperature_2: 'Temperatura immessa', outside_temperature_2: 'Temperatura espulsa', humidity: 'Umidità', co2: 'CO2 equivalente' },
};

class PranaDevice {
  constructor(platform, config, accessory) {
    this.platform = platform;
    this.api = platform.api;
    this.log = platform.log;
    this.config = config;
    this.accessory = accessory;
    this.client = new PranaClient(config.host, config.port ?? 80, config.timeout ?? 5000);
    this.name = config.name || accessory.displayName;
    this.words = WORDS[config.language || platform.config.language] || WORDS.en;
    this.pollSeconds = Math.max(5, Number(config.pollInterval ?? platform.config.pollInterval) || 10);
    this.queue = Promise.resolve();
    this.bindings = [];
    this.stopped = false;
  }

  enqueue(task) {
    const pending = this.queue.then(task);
    this.queue = pending.catch(() => {});
    return pending;
  }

  async start() {
    clearTimeout(this.timer);
    try {
      await this.enqueue(async () => {
        const info = await this.client.info();
        if (this.accessory.context.deviceId && this.accessory.context.deviceId !== info.manufactureId) {
          throw new Error('Device identity changed: check the configured host before reconnecting');
        }
        this.info = info;
        this.state = await this.client.state();
        this.updatedAt = Date.now();
        this.accessory.context.deviceId = info.manufactureId;
        this.accessory.context.host = this.config.host;
        this.accessory.displayName = this.name;
        this.configure();
        this.online = true;
        this.publish();
        this.platform.saveAccessory(this.accessory);
        this.log.info(`${this.name}: connected (firmware ${info.fwVersion})`);
      });
    } catch (error) { this.fail(error); }
    if (!this.stopped) this.timer = setTimeout(() => this.poll(), this.pollSeconds * 1000);
  }

  stop() { this.stopped = true; clearTimeout(this.timer); }

  async poll() {
    clearTimeout(this.timer);
    if (this.stopped) return;
    if (!this.info || !this.bindings.length) return this.start();
    try { await this.enqueue(() => this.refresh()); } catch (error) { this.fail(error); }
    if (!this.stopped) this.timer = setTimeout(() => this.poll(), this.pollSeconds * 1000);
  }

  async refresh() {
    this.state = await this.client.state();
    this.updatedAt = Date.now();
    const recovered = !this.online;
    this.online = true;
    this.publish();
    if (recovered) this.log.info(`${this.name}: connection restored`);
  }

  unavailable() { return new this.api.hap.HapStatusError(this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE); }

  requireState() {
    if (!this.online || Date.now() - this.updatedAt > Math.max(30, this.pollSeconds * 3) * 1000) throw this.unavailable();
    return this.state;
  }

  fail(error) {
    if (this.online !== false) this.log.warn(`${this.name}: ${error.message}`);
    this.online = false;
    for (const { characteristic } of this.bindings) characteristic.updateValue(this.unavailable());
    if (!this.bindings.length) {
      const { Service: S, Characteristic: C } = this.api.hap;
      for (const service of this.accessory.services) {
        if (service.UUID === S.AccessoryInformation.UUID) continue;
        for (const characteristic of service.characteristics) {
          if ([C.Name.UUID, C.ConfiguredName.UUID].includes(characteristic.UUID) || !characteristic.props.perms.includes('pr')) continue;
          characteristic.onGet(() => { throw this.unavailable(); });
          characteristic.updateValue(this.unavailable());
        }
      }
    }
  }

  async write(command) {
    try {
      await this.enqueue(async () => {
        this.requireState();
        await command();
        await this.refresh();
      });
    } catch (error) {
      this.fail(error);
      throw this.unavailable();
    }
  }

  fanState(type) {
    const s = this.requireState();
    if (s.bound) return s.bounded;
    if (type !== 'main') return s[type];
    return { ...s.supply, is_on: s.supply.is_on || s.extract.is_on,
      speed: Math.max(s.supply.is_on ? s.supply.speed : 0, s.extract.is_on ? s.extract.speed : 0) };
  }

  targets(type) {
    if (this.state.bound) return ['bounded'];
    return type === 'main' ? ['supply', 'extract'] : [type];
  }

  async setActive(type, active) {
    // Firmware 49 can toggle even when the supplied value matches the current
    // value. Always read first, and never send redundant power commands.
    this.state = await this.client.state();
    for (const target of this.targets(type)) {
      if (this.state[target].is_on === active) continue;
      await this.client.active(target, active);
      this.state = await this.client.state();
      if (this.state[target].is_on !== active) throw new Error('Prana did not confirm the requested power state');
    }
  }

  async manual() {
    for (const mode of ['auto', 'auto_plus']) {
      if (this.state[mode]) await this.client.switch(mode, false);
    }
  }

  async setSwitch(key, value) {
    this.state = await this.client.state();
    if (this.state[key] === value) return;
    if (!value && ['night', 'boost'].includes(key)) {
      // Night/Boost are derived speed presets on firmware 49. A false value
      // on /setSwitch does not leave the preset; select an adjacent normal step.
      await this.manual();
      for (const target of this.targets('main')) {
        if (!this.state[target].is_on) continue;
        const max = this.state[target].max_speed / 10;
        const step = key === 'night' ? Math.min(2, max) : Math.max(1, max - 1);
        await this.client.speed(target, step * 10);
      }
    } else await this.client.switch(key, value);
  }

  service(Type, key, name) {
    const C = this.api.hap.Characteristic;
    const service = this.accessory.getServiceById(Type, key) || this.accessory.addService(Type, name, key);
    service.setCharacteristic(C.Name, name);
    if (C.ConfiguredName) {
      if (!service.testCharacteristic(C.ConfiguredName)) service.addOptionalCharacteristic(C.ConfiguredName);
      service.setCharacteristic(C.ConfiguredName, name);
    }
    this.usedServices.add(service);
    return service;
  }

  bind(service, Type, get, set) {
    const characteristic = service.getCharacteristic(Type);
    characteristic.onGet(() => { this.requireState(); return get(); });
    if (set) characteristic.onSet(value => this.write(() => set(value)));
    this.bindings.push({ characteristic, get });
    return characteristic;
  }

  configureFan(type, name) {
    const { Service: S, Characteristic: C } = this.api.hap;
    const fan = this.service(S.Fanv2, `fan-${type}`, name);
    if (type === 'main') fan.setPrimaryService(true);
    this.bind(fan, C.Active, () => Number(this.fanState(type).is_on), value => this.setActive(type, Boolean(value)));
    this.bind(fan, C.CurrentFanState, () => this.fanState(type).is_on ? C.CurrentFanState.BLOWING_AIR : C.CurrentFanState.INACTIVE);
    this.bind(fan, C.RotationSpeed, () => speedPercent(this.fanState(type)), async value => {
      if (value === 0) return this.setActive(type, false);
      await this.manual();
      for (const target of this.targets(type)) {
        await this.client.speed(target, speedCommand(value, this.state[target]));
      }
    });
    this.bind(fan, C.TargetFanState, () => this.state.auto || this.state.auto_plus ? C.TargetFanState.AUTO : C.TargetFanState.MANUAL, async value => {
      if (value === C.TargetFanState.AUTO) await this.client.switch('auto', true);
      else await this.manual();
    });
  }

  configure() {
    const { Service: S, Characteristic: C } = this.api.hap;
    this.usedServices = new Set();
    const information = this.accessory.getService(S.AccessoryInformation);
    information.setCharacteristic(C.Manufacturer, 'PRANA')
      .setCharacteristic(C.Model, this.config.model || `Prana ${this.info.pranaModel}/${this.info.pranaSubtype}`)
      .setCharacteristic(C.SerialNumber, this.info.manufactureId)
      .setCharacteristic(C.FirmwareRevision, String(this.info.fwVersion));
    this.usedServices.add(information);
    this.configureFan('main', this.name);
    if (this.config.separateFans) {
      for (const type of ['supply', 'extract']) this.configureFan(type, `${this.name} ${this.words[type]}`);
    }
    for (const key of SWITCH_TYPES) {
      if (typeof this.state[key] !== 'boolean' || (key === 'heater' && this.config.exposeHeater === false)) continue;
      const service = this.service(S.Switch, `switch-${key}`, `${this.name} ${this.words[key]}`);
      this.bind(service, C.On, () => Boolean(this.state[key]), value => this.setSwitch(key, Boolean(value)));
    }
    const sensors = [
      ['inside_temperature', S.TemperatureSensor, C.CurrentTemperature, -100, 100, 10],
      ['outside_temperature', S.TemperatureSensor, C.CurrentTemperature, -100, 100, 10],
      ['inside_temperature_2', S.TemperatureSensor, C.CurrentTemperature, -100, 100, 10],
      ['outside_temperature_2', S.TemperatureSensor, C.CurrentTemperature, -100, 100, 10],
      ['humidity', S.HumiditySensor, C.CurrentRelativeHumidity, 0, 100, 1],
      ['co2', S.CarbonDioxideSensor, C.CarbonDioxideLevel, 0, 100000, 1],
    ];
    for (const [key, Type, Char, min, max, divisor] of sensors) {
      if (!Number.isFinite(this.state[key])) continue;
      const service = this.service(Type, `sensor-${key}`, `${this.name} ${this.words[key]}`);
      const get = () => {
        const value = this.state[key] / divisor;
        if (!Number.isFinite(value) || value < min || value > max) throw this.unavailable();
        return value;
      };
      this.bind(service, Char, get).setProps({ minValue: min, maxValue: max });
      if (key === 'co2') {
        const threshold = Number(this.config.co2Threshold) || 1000;
        this.bind(service, C.CarbonDioxideDetected, () => get() >= threshold ? C.CarbonDioxideDetected.CO2_LEVELS_ABNORMAL : C.CarbonDioxideDetected.CO2_LEVELS_NORMAL);
      }
    }
    for (const service of [...this.accessory.services]) {
      if (!this.usedServices.has(service) && /^(fan|switch|sensor)-/.test(service.subtype || '')) this.accessory.removeService(service);
    }
  }

  publish() {
    for (const { characteristic, get } of this.bindings) {
      try { characteristic.updateValue(get()); } catch { characteristic.updateValue(this.unavailable()); }
    }
  }
}

module.exports = { PranaDevice };
