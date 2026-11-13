# Homebridge Prana Local

Control PRANA ventilation and heat-recovery units from Apple Home and Siri over your local Wi-Fi network. No cloud account, Bluetooth gateway, Home Assistant installation or firmware modification is needed.

This is an independent community plugin, not an official or Homebridge-verified PRANA product.

## Requirements and compatibility

- A Wi-Fi PRANA unit exposing the local HTTP API, with **firmware 49 or newer**.
- Homebridge 1.8+ or 2.x, with a supported Node.js release. The initial hardware validation uses Homebridge 2.4.0 and Node.js 22 on a Raspberry Pi 3 Model B+ (32 bit).
- The PRANA unit and Homebridge must be reachable on the same trusted LAN.
- A DHCP reservation is recommended. The API has no authentication and uses local HTTP: keep it inside your trusted LAN and do not forward its port to the internet.

Initial target: **PRANA 210 G ERP PRO M23, firmware 49**. Other models using the same API may work, but are not hardware-verified. Device-specific capabilities and sensors vary.

The device's `/info` API may use a different model family label from its printed commercial name. The optional `model` setting lets you preserve the printed label.

## Install from GitHub

In **Homebridge UI → Plugins → wrench menu → Install a specific plugin**, install:

```text
https://github.com/viames/homebridge-prana-local/releases/download/v0.1.0/homebridge-prana-local-0.1.0.tgz
```

Alternatively, from a terminal with access to the Homebridge plugin installation directory:

```sh
npm install https://github.com/viames/homebridge-prana-local/releases/download/v0.1.0/homebridge-prana-local-0.1.0.tgz
```

Run the command in your installation's plugin directory as its owning user. Use your usual Homebridge UI/installer to restart Homebridge after configuring the plugin. No build step or runtime dependencies are required. Source installations also work with `npm install viames/homebridge-prana-local`.

The release is distributed through GitHub; it is **not published on npm**, so it will not appear in the standard npm plugin search.

## Configuration

Use the plugin's settings form, or add this entry to `platforms` in Homebridge's `config.json`:

```json
{
  "platform": "PranaLocal",
  "name": "Prana Local",
  "language": "en",
  "pollInterval": 10,
  "devices": [
    {
      "id": "kitchen",
      "name": "Kitchen ventilation",
      "host": "192.168.1.50",
      "model": "210G ERP PRO M23",
      "separateFans": false,
      "exposeHeater": true
    }
  ]
}
```

`id` is a unique, permanent identifier for each unit. Keep it unchanged if its IP changes so HomeKit retains the accessory identity. When omitted, the host is used instead. `language` supports `en` and `it` for initial service labels. Apple Home may retain previously assigned names.

Optional settings: `port` (80), `timeout` (5000 ms), `co2Threshold` (1000 ppm). Polling is every 10 seconds by default, with a minimum of 5 seconds. Multiple units are supported through the `devices` array. Configure each physical unit once.

If Homebridge is already paired with Apple Home, new accessories are added through that bridge. A separately configured child bridge must be paired once in Apple Home. Add the ventilation accessory to its room and use **Show as Separate Tiles** if you want individual mode switches visible.

## Apple Home controls

| Service | Behavior |
| --- | --- |
| Ventilation fan | On/off and 0–100% speed, converted to the unit's discrete speed steps |
| Fan automatic mode | Enables normal AUTO; manual mode exits AUTO and AUTO+ |
| Automatic / Quiet automatic switches | Native PRANA AUTO and AUTO+ modes |
| Night / Boost switches | Enable native presets; turning Night off selects step 2, turning Boost off selects the step below maximum |
| Balanced airflow switch | Links/unlinks the two airflows using the unit's `bound` mode |
| Winter / Mini heater switches | Native device functions; mini heater can be hidden with `exposeHeater: false` |
| Temperature sensors | Indoor, outdoor, supply-after-recovery and exhaust-after-recovery, when reported |
| Humidity | Indoor relative humidity |
| Equivalent CO2 | PRANA's **CO2eq estimate**, in ppm, with a configurable abnormal-level threshold |
| Optional separate fans | Independent supply/extract controls, following the unit's synchronized mode when enabled |

The main fan controls both airflows. If they are separate, its on/off commands operate both without changing `bound`; its speed command sets both to the requested percentage. Its displayed speed is the higher of the two airflow speeds. Optional separate controls target the shared fan when the unit is in synchronized mode.

Startup and polling only read the unit. Setting a speed explicitly exits automatic modes; the device determines Night/Boost from the selected speed. Leaving Night or Boost via its switch selects the adjacent normal speed and exits automatic modes. Power commands read the actual state first to avoid a firmware 49 quirk where redundant power requests toggle the motor. Speed commands use `/setSpeed` alone, which already turns the motor on. Heater and winter settings are only changed when their own switches are operated. The plugin does not override PRANA's built-in operating constraints.

CO2eq is not a direct CO2 measurement and this plugin must not be used as a safety alarm. VOC (reported by PRANA in ppb) and atmospheric pressure are not exposed: Apple Home has no equivalent standard pressure tile, and its VOC density characteristic uses different units. Display brightness and sleep timers are also not exposed. They remain available in the manufacturer's app. Do not expect every PRANA app screen to have a corresponding Apple Home control.

## Reliability and troubleshooting

- Commands and polling are serialized per unit. All control changes are followed by a state read.
- Unreachable or invalid devices report a HomeKit communication error. The plugin retries automatically and resumes when connectivity returns.
- Cached readings are rejected after they become stale. An IP pointing to another device is rejected at startup using the previously stored manufacture ID.
- A firmware below 49 or HTTP 404 on `/info` usually means the local API is unavailable. Check firmware in **Prana Online 2.0**, and update through the manufacturer's app if required.
- If the plugin starts before the unit is online, it retries without writing settings.
- If adding optional sensors through a firmware update, restart the plugin to discover the new sensor services.
- Use the Homebridge UI logs to diagnose connection errors. Do not share your complete Homebridge configuration, pairing PIN, account tokens or private network capture.

## Development

```sh
npm ci
npm run check
npm test
npm pack --dry-run
```

Tests use a mock local HTTP device and real HomeKit services from HAP-NodeJS. They cover startup without writes, speed scaling, separate/synchronized flow control, presets, sensor units, offline recovery, invalid firmware and payloads, timeouts and stable accessory identities.

The implementation uses PRANA's local API contract as documented by its integration in [Home Assistant](https://www.home-assistant.io/integrations/prana/) and the [PRANA API client](https://pypi.org/project/prana-api-client/). It is a separate JavaScript implementation; no Python or Home Assistant runtime is included. Homebridge plugin structure follows the [official developer documentation](https://developers.homebridge.io/).

Contributions and hardware reports are welcome. Include your printed model, firmware, Homebridge/Node versions, and a redacted error message. Do not include credentials or manufacture identifiers.
