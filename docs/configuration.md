# Configuration reference

[← Overview](../README.md) · [Install](installation.md) · [Help](troubleshooting.md) · [Italiano](../README.it.md#configurazione)

## Minimal configuration

Add this object to the existing `platforms` array:

```json
{
  "platform": "PranaLocal",
  "name": "Prana Local",
  "language": "en",
  "devices": [
    {
      "id": "prana-1",
      "name": "PRANA ventilation",
      "host": "192.0.2.10"
    }
  ]
}
```

**Replace `192.0.2.10` with the real LAN address.** It is a reserved documentation address, not a working device address. Choose your own accessory name and assign its room in Apple Home.

The form requires `id`, `name` and `host`. Hand-written JSON technically needs only `host`; an explicit stable ID is recommended because a host-derived identity changes when the address changes.

## All settings

| Key | Default | Meaning |
| --- | --- | --- |
| `platform` | Required: `PranaLocal` | Platform alias |
| `name` | `Prana Local` in the form | Platform label in Homebridge |
| `language` | `en` | Initial labels: `en` or `it` |
| `pollInterval` | `10` | Poll interval, seconds; form 5–300, runtime minimum 5 |
| `devices` | Required array | One entry per physical unit |

Device fields:

| Key | Default | Meaning |
| --- | --- | --- |
| `id` | Uses `host` when omitted | Unique permanent identity; retain it on address changes |
| `name` | `Prana ventilation` when omitted | Your accessory name; Home can retain previous names |
| `host` | Required | IPv4 address or resolvable hostname; no protocol/path |
| `port` | `80` | HTTP port, 1–65535 |
| `model` | API model/subtype | Optional commercial label, not a compatibility override |
| `separateFans` | `false` | Also expose supply and extract fans |
| `exposeHeater` | `true` | Show mini heater when reported |
| `co2Threshold` | `1000` | Abnormal CO₂eq threshold in ppm; form 400–10000 |
| `timeout` | `5000` | Request timeout, ms; 500–30000 |
| `language` | Platform language | Per-device JSON override |
| `pollInterval` | Platform interval | Per-device JSON override |

No PRANA account, password, Bluetooth PIN or API key is needed.

## Multiple units

```json
{
  "platform": "PranaLocal",
  "language": "en",
  "devices": [
    { "id": "prana-1", "name": "PRANA ventilation 1", "host": "192.0.2.10" },
    { "id": "prana-2", "name": "PRANA ventilation 2", "host": "192.0.2.11", "separateFans": true, "exposeHeater": false }
  ]
}
```

Replace both documentation addresses. Give each unit a unique ID; configure each physical unit once. Multiple-unit support is implemented; the initial hardware test used one unit.

## Controls and sensors

### Airflow

| Control | Behavior |
| --- | --- |
| Main fan on/off | Operates both flows without changing separate/synchronized mode |
| Speed 1–100% | Exits AUTO/AUTO+ and maps to actual device steps |
| Speed 0% | Turns selected fan(s) off |
| Fan automatic/manual | Enables normal AUTO / exits AUTO and AUTO+ |
| Optional separate fans | Independent flows when unlinked; shared fan when synchronized |
| Balanced airflow switch | Enables/disables native `bound` synchronization |

On a six-step unit, about 17% is step 1, 33% is step 2, 50% is step 3 and 100% is step 6. Maximum speed is read from the unit, not hard-coded.

When flows are separate, the main fan shows the higher active speed and sets both flows to the requested percentage. Use separate controls for deliberately different flows.

### Operating modes

| Switch | On | Off |
| --- | --- | --- |
| Automatic | Native AUTO | Disables AUTO |
| Quiet automatic | Native AUTO+ | Disables AUTO+ |
| Night | Native minimum-speed preset | Exits automatic modes; step 2 on active flows |
| Boost | Native maximum-speed preset | Exits automatic modes; step below maximum on active flows |
| Winter | Requests native winter function | Requests it off |
| Mini heater | Requests native mini heater | Requests it off |

Night/Boost exit behavior accounts for firmware 49, where presets derive from speed and a false preset command does not leave the preset. Winter/heater operation depends on the unit's own temperature and operating constraints. Initial live command tests did not toggle heater or winter.

### Sensor mapping

| Label | API field | Meaning |
| --- | --- | --- |
| Indoor temperature | `inside_temperature` | Extracted room air, °C |
| Outdoor temperature | `outside_temperature` | Fresh outdoor air, °C |
| Supply temperature | `inside_temperature_2` | Incoming air after heat exchange, °C |
| Exhaust temperature | `outside_temperature_2` | Outgoing air after heat exchange, °C |
| Humidity | `humidity` | Indoor relative humidity, % |
| Equivalent CO₂ | `co2` | CO₂eq estimate, ppm |

Services are created only for fields reported at startup. The tested unit reported three temperatures, humidity and CO₂eq; `inside_temperature_2` was absent. Other units may differ. Restart after a firmware update that adds sensors.

CO₂eq is not direct CO₂ measurement. Its threshold affects the abnormal-level status, not certified alarm behavior.

### Functions kept in the PRANA app

| Function | Limitation |
| --- | --- |
| VOC | PRANA uses ppb; HomeKit's VOC density uses a different unit |
| Atmospheric pressure | No equivalent standard pressure tile in Apple Home |
| Display brightness, sleep timer | Not implemented by this release |
| Filter condition, recovery efficiency | Not implemented by the current API mapping |
| Firmware updates, cloud history | Managed by the manufacturer |

## State and reconnection

Startup/polling only read state. Requests are serialized per unit and changes are followed by a read. On firmware 49, redundant power requests can toggle a motor: the plugin reads fresh state, skips unnecessary power commands and verifies the result. Speed already turns a motor on, so no extra power toggle follows it.

Failures are reported to HomeKit and retried. Readings become stale after the greater of 30 seconds or three poll intervals. At startup, the cached manufacture ID must match the reached unit. When the IP changes, update `host` and keep `id` unchanged.
