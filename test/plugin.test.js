'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const hap = require('@homebridge/hap-nodejs');
const { PranaClient, speedPercent, speedCommand } = require('../lib/client');
const { PranaDevice } = require('../lib/device');
const { PranaPlatform } = require('../lib/platform');

function initialState() {
  return {
    supply: { speed: 1, max_speed: 60, is_on: true },
    extract: { speed: 1, max_speed: 60, is_on: true },
    bounded: { speed: 0, max_speed: 60, is_on: false },
    bound: false, auto: false, auto_plus: true, night: true, boost: false, winter: false, heater: false,
    inside_temperature: 259, outside_temperature: 235, outside_temperature_2: 273,
    humidity: 55, voc: 321, air_pressure: 751, co2: 400,
  };
}

async function mock(t) {
  const state = initialState();
  const requests = [];
  let broken = false;
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = body ? JSON.parse(body) : undefined;
    requests.push({ method: req.method, path: req.url, data });
    res.setHeader('Content-Type', 'application/json');
    if (broken) { res.statusCode = 503; return res.end('{}'); }
    if (req.url === '/info') return res.end(JSON.stringify({ manufactureId: 'TEST-ONLY-001', isValid: true, fwVersion: 49, pranaModel: 2, pranaSubtype: 2 }));
    if (req.url === '/getState') return res.end(JSON.stringify(state));
    if (req.url === '/setSwitch') {
      if (!['night', 'boost'].includes(data.switchType) || data.value) state[data.switchType] = data.value;
    } else if (req.url === '/setSpeed') {
      state[data.fanType].speed = data.speed / 10;
      state[data.fanType].is_on = true;
      state.night = state.supply.speed === 1 && state.extract.speed === 1;
      state.boost = state.supply.speed === 6 && state.extract.speed === 6;
    } else if (req.url === '/setSpeedIsOn') state[data.fanType].is_on = !state[data.fanType].is_on;
    else res.statusCode = 404;
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { state, requests, port: server.address().port, break: () => { broken = true; }, recover: () => { broken = false; } };
}

function context(config = {}) {
  class PlatformAccessory extends hap.Accessory { context = {}; }
  const api = Object.assign(new EventEmitter(), { hap, platformAccessory: PlatformAccessory });
  const registered = [];
  api.registerPlatformAccessories = (_plugin, _platform, list) => registered.push(...list);
  api.updatePlatformAccessories = () => {};
  api.unregisterPlatformAccessories = () => {};
  const log = { info() {}, warn() {}, error() {} };
  const platform = new PranaPlatform(log, config, api);
  const accessory = new hap.Accessory('Test Prana', hap.uuid.generate('test-prana'));
  accessory.context = {};
  return { api, log, platform, accessory, registered };
}

async function device(t, config = {}) {
  const server = await mock(t);
  const c = context();
  const d = new PranaDevice(c.platform, { host: '127.0.0.1', port: server.port, ...config }, c.accessory);
  t.after(() => d.stop());
  await d.start();
  assert.equal(d.online, true);
  return { ...server, ...c, d };
}

test('speed conversion respects device-specific six and ten step ranges', () => {
  assert.equal(speedPercent({ speed: 1, max_speed: 60, is_on: true }), 17);
  assert.equal(speedPercent({ speed: 6, max_speed: 60, is_on: true }), 100);
  assert.equal(speedPercent({ speed: 3, max_speed: 60, is_on: false }), 0);
  assert.equal(speedCommand(50, { max_speed: 60 }), 30);
  assert.equal(speedCommand(1, { max_speed: 100 }), 10);
  assert.equal(speedCommand(100, { max_speed: 100 }), 100);
  assert.throws(() => speedCommand(NaN, { max_speed: 60 }));
});

test('client validates destinations and command payloads before sending', () => {
  assert.throws(() => new PranaClient('http://device.local/path'));
  assert.throws(() => new PranaClient('device.local', 0));
  assert.throws(() => new PranaClient('device.local', 80, 0));
  const c = new PranaClient('device.local');
  assert.throws(() => c.speed('bounded', 25));
  assert.throws(() => c.active('unknown', true));
  assert.throws(() => c.switch('heater', 'false'));
});

test('startup exposes real HomeKit services without issuing any writes', async t => {
  const { accessory, requests, d } = await device(t);
  assert.ok(requests.every(r => r.method === 'GET'));
  assert.equal(d.fanState('main').speed, 1);
  const temperature = accessory.getServiceById(hap.Service.TemperatureSensor, 'sensor-inside_temperature');
  assert.ok(Math.abs(await temperature.getCharacteristic(hap.Characteristic.CurrentTemperature).handleGetRequest() - 25.9) < 0.0001);
  assert.equal(accessory.getServiceById(hap.Service.TemperatureSensor, 'sensor-inside_temperature_2'), undefined);
  assert.equal(accessory.getServiceById(hap.Service.CarbonDioxideSensor, 'sensor-co2').getCharacteristic(hap.Characteristic.CarbonDioxideLevel).value, 400);
  assert.equal(accessory.getServiceById(hap.Service.Fanv2, 'fan-main').getCharacteristic(hap.Characteristic.TargetFanState).value, hap.Characteristic.TargetFanState.AUTO);
  assert.equal(accessory.services.length, 14);
});

test('HomeKit speed writes stop presets, use scaled steps and control both separate flows', async t => {
  const { d, accessory, state, requests } = await device(t);
  const fan = accessory.getServiceById(hap.Service.Fanv2, 'fan-main');
  await fan.getCharacteristic(hap.Characteristic.RotationSpeed).handleSetRequest(50);
  assert.equal(state.supply.speed, 3);
  assert.equal(state.extract.speed, 3);
  assert.equal(state.auto_plus, false);
  assert.equal(state.night, false);
  assert.equal(state.bound, false);
  assert.deepEqual(requests.filter(r => r.path === '/setSpeed').map(r => r.data), [
    { fanType: 'supply', speed: 30 }, { fanType: 'extract', speed: 30 },
  ]);
  await fan.getCharacteristic(hap.Characteristic.Active).handleSetRequest(0);
  assert.equal(state.supply.is_on, false);
  assert.equal(state.extract.is_on, false);
  assert.equal(d.fanState('main').is_on, false);
});

test('bound mode routes independent fan controls to the synchronized motor', async t => {
  const { accessory, state, requests, d } = await device(t, { separateFans: true });
  state.bound = true;
  state.bounded = { speed: 2, max_speed: 60, is_on: true };
  await d.enqueue(() => d.refresh());
  const supply = accessory.getServiceById(hap.Service.Fanv2, 'fan-supply');
  await supply.getCharacteristic(hap.Characteristic.RotationSpeed).handleSetRequest(100);
  assert.equal(state.bounded.speed, 6);
  assert.deepEqual(requests.filter(r => r.path === '/setSpeed').map(r => r.data), [{ fanType: 'bounded', speed: 60 }]);
});

test('repeated power requests cannot toggle an already correct fan state', async t => {
  const { accessory, requests, state } = await device(t);
  const active = accessory.getServiceById(hap.Service.Fanv2, 'fan-main').getCharacteristic(hap.Characteristic.Active);
  await active.handleSetRequest(1);
  assert.equal(requests.filter(r => r.path === '/setSpeedIsOn').length, 0);
  await active.handleSetRequest(0);
  await active.handleSetRequest(0);
  assert.equal(requests.filter(r => r.path === '/setSpeedIsOn').length, 2);
  assert.equal(state.supply.is_on, false);
  await active.handleSetRequest(1);
  assert.equal(state.supply.is_on, true);
  assert.equal(state.extract.is_on, true);
});

test('leaving the Night preset uses a normal speed rather than an ignored false switch', async t => {
  const { accessory, requests, state } = await device(t);
  await accessory.getServiceById(hap.Service.Switch, 'switch-night').getCharacteristic(hap.Characteristic.On).handleSetRequest(false);
  assert.equal(state.night, false);
  assert.equal(state.auto_plus, false);
  assert.equal(state.supply.speed, 2);
  assert.equal(state.extract.speed, 2);
  assert.equal(requests.some(r => r.path === '/setSwitch' && r.data.switchType === 'night'), false);
});

test('unreachable devices report HomeKit communication errors and recover', async t => {
  const { accessory, d, break: disconnect, recover } = await device(t);
  disconnect();
  await d.poll();
  const fan = accessory.getServiceById(hap.Service.Fanv2, 'fan-main');
  await assert.rejects(fan.getCharacteristic(hap.Characteristic.Active).handleGetRequest());
  await assert.rejects(fan.getCharacteristic(hap.Characteristic.Active).handleSetRequest(1));
  recover();
  await d.poll();
  assert.equal(await fan.getCharacteristic(hap.Characteristic.Active).handleGetRequest(), 1);
  assert.equal(d.online, true);
});

test('device identity mismatch never sends a control command', async t => {
  const server = await mock(t);
  const c = context();
  c.accessory.context.deviceId = 'ANOTHER-DEVICE';
  const d = new PranaDevice(c.platform, { host: '127.0.0.1', port: server.port }, c.accessory);
  t.after(() => d.stop());
  await d.start();
  assert.equal(d.online, false);
  assert.ok(server.requests.every(r => r.method === 'GET'));
  assert.equal(c.registered.length, 0);
});

test('cached accessories are marked unavailable when startup cannot reach their unit', async t => {
  const { d, accessory, break: disconnect, platform } = await device(t);
  d.stop();
  disconnect();
  const retry = new PranaDevice(platform, d.config, accessory);
  t.after(() => retry.stop());
  await retry.start();
  assert.equal(retry.online, false);
  const fan = accessory.getServiceById(hap.Service.Fanv2, 'fan-main');
  await assert.rejects(fan.getCharacteristic(hap.Characteristic.Active).handleGetRequest());
});

test('concurrent HomeKit commands are serialized and stale readings are rejected', async t => {
  const { d, accessory, state, requests } = await device(t);
  const fan = accessory.getServiceById(hap.Service.Fanv2, 'fan-main');
  await Promise.all([
    fan.getCharacteristic(hap.Characteristic.RotationSpeed).handleSetRequest(33),
    fan.getCharacteristic(hap.Characteristic.RotationSpeed).handleSetRequest(67),
  ]);
  assert.deepEqual(requests.filter(r => r.path === '/setSpeed').map(r => r.data.speed), [20, 20, 40, 40]);
  assert.equal(state.supply.speed, 4);
  d.updatedAt = Date.now() - 60000;
  await assert.rejects(fan.getCharacteristic(hap.Characteristic.Active).handleGetRequest());
});

test('optional controls, Italian names and stable configured IDs survive restarts', async t => {
  const server = await mock(t);
  const c = context({ language: 'it', devices: [{ id: 'kitchen', name: 'VMC Cucina', host: '127.0.0.1', port: server.port, exposeHeater: false }] });
  t.after(() => c.platform.controllers.forEach(d => d.stop()));
  await c.platform.launch();
  assert.equal(c.registered.length, 1);
  const accessory = c.registered[0];
  assert.equal(accessory.UUID, hap.uuid.generate('homebridge-prana-local:kitchen'));
  assert.equal(accessory.getServiceById(hap.Service.Switch, 'switch-auto').displayName, 'VMC Cucina Automatico');
  assert.equal(accessory.getServiceById(hap.Service.Switch, 'switch-heater'), undefined);
});

test('malformed state, old firmware, invalid JSON and request timeouts are rejected', async t => {
  const server = http.createServer((req, res) => {
    if (req.url === '/hang') return;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/info') return res.end(JSON.stringify({ isValid: true, manufactureId: 'TEST', fwVersion: 48 }));
    if (req.url === '/getState') return res.end(JSON.stringify({ bound: false }));
    res.end('not json');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const client = new PranaClient('127.0.0.1', server.address().port, 500);
  await assert.rejects(client.info(), /firmware 49/);
  await assert.rejects(client.state(), /Invalid Prana fan state/);
  await assert.rejects(client.request('/bad'), /Invalid JSON/);
  await assert.rejects(client.request('/hang'), /timed out/);
});
