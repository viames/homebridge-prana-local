'use strict';

const http = require('node:http');

const FAN_TYPES = ['supply', 'extract', 'bounded'];
const SWITCH_TYPES = ['auto', 'auto_plus', 'night', 'boost', 'bound', 'winter', 'heater'];

class PranaClient {
  constructor(host, port = 80, timeout = 5000) {
    if (typeof host !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(host)) {
      throw new Error('host must be an IPv4 address or hostname, without http:// or a path');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
    if (!Number.isInteger(timeout) || timeout < 500 || timeout > 30000) throw new Error('Timeout must be 500..30000 milliseconds');
    this.host = host;
    this.port = port;
    this.timeout = timeout;
  }

  request(path, body) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request({
        hostname: this.host, port: this.port, path,
        method: data === undefined ? 'GET' : 'POST',
        headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        agent: false,
      }, response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          text += chunk;
          if (text.length > 65536) request.destroy(new Error('Prana response is too large'));
        });
        response.on('error', reject);
        response.on('end', () => {
          if (response.statusCode !== 200) return reject(new Error(`Prana HTTP ${response.statusCode} on ${path}`));
          if (data !== undefined) return resolve();
          try { resolve(JSON.parse(text)); } catch { reject(new Error(`Invalid JSON on ${path}`)); }
        });
      });
      const timer = setTimeout(() => request.destroy(new Error('Prana request timed out')), this.timeout);
      request.on('close', () => clearTimeout(timer));
      request.on('error', reject);
      request.end(data);
    });
  }

  async info() {
    const info = await this.request('/info');
    if (!info || info.isValid !== true || typeof info.manufactureId !== 'string' || !info.manufactureId.trim()) {
      throw new Error('Not a valid Prana local API device');
    }
    if (!Number.isFinite(Number(info.fwVersion)) || Number(info.fwVersion) < 49) throw new Error('Prana firmware 49 or newer is required');
    return info;
  }

  async state() {
    const state = await this.request('/getState');
    if (!state || typeof state.bound !== 'boolean' || !FAN_TYPES.every(type => {
      const fan = state[type];
      return fan && typeof fan.is_on === 'boolean' && Number.isFinite(fan.speed) && fan.speed >= 0
        && Number.isFinite(fan.max_speed) && fan.max_speed >= 10 && fan.max_speed <= 100 && fan.max_speed % 10 === 0
        && fan.speed <= fan.max_speed / 10;
    })) throw new Error('Invalid Prana fan state');
    return state;
  }

  switch(type, value) {
    if (!SWITCH_TYPES.includes(type) || typeof value !== 'boolean') throw new Error('Invalid switch command');
    return this.request('/setSwitch', { switchType: type, value });
  }

  active(type, value) {
    if (!FAN_TYPES.includes(type) || typeof value !== 'boolean') throw new Error('Invalid fan command');
    return this.request('/setSpeedIsOn', { fanType: type, value });
  }

  speed(type, speed) {
    if (!FAN_TYPES.includes(type) || !Number.isInteger(speed) || speed < 10 || speed > 100 || speed % 10 !== 0) {
      throw new Error('Speed must be 10..100 in steps of 10');
    }
    return this.request('/setSpeed', { fanType: type, speed });
  }
}

function speedPercent(fan) {
  return fan.is_on ? Math.max(0, Math.min(100, Math.round(fan.speed / (fan.max_speed / 10) * 100))) : 0;
}

function speedCommand(percent, fan) {
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error('Percentage must be greater than 0 and at most 100');
  return Math.max(1, Math.round(percent / 100 * (fan.max_speed / 10))) * 10;
}

module.exports = { PranaClient, speedPercent, speedCommand, FAN_TYPES, SWITCH_TYPES };
