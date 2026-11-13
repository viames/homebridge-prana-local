# Troubleshooting and FAQ

[← Overview](../README.md) · [Install](installation.md) · [Settings](configuration.md) · [Italiano](../README.it.md#problemi-comuni)

## Start here

| Symptom | First check |
| --- | --- |
| Missing from plugin search | Search the exact npm name `homebridge-prana-local`; GitHub archives are also available |
| Missing after installation | Check the running Homebridge's plugin location; restart |
| No `connected` message | IP, HTTP port, firmware and local API |
| Apple Home “No Response” | Unit connectivity and plugin logs |
| Missing sensors | Fields actually reported by the unit |
| Speed exits automatic mode | Expected behavior |
| Name does not update | Apple Home may retain a previously assigned name |

## The unit will not connect

1. Confirm power, Wi-Fi and operation in the manufacturer's app.
2. Check the IP in the router. A hostname must resolve on the **Homebridge host**, not just your phone.
3. Check HTTP port **80** by default. An advertised mDNS port is not necessarily the API port.
4. Try `http://YOUR-PRANA-IP/info` from the host/network. Expect `isValid: true`, firmware 49+. Do not publish the manufacture ID.
5. A 404 may mean older firmware or a different API. Check firmware in Prana Online 2.0 and update using the manufacturer's process.
6. Check guest-network isolation, VLAN rules, container routing and firewalls. Similar Wi-Fi names do not ensure device-to-device reachability.

Do not reset the entire bridge as a first troubleshooting step.

## No Response or missing accessories

The plugin marks failed communication unavailable, retries automatically and logs `connection restored` after recovery. If only PRANA is affected, check its address/API. If all accessories fail, check Homebridge/HomeKit networking and pairing.

After a `connected (firmware …)` message, check Homebridge's assigned room and the main fan's settings. Home can group sensors and switches under one accessory. Already paired bridges need no new pairing; child bridges need their own pairing.

Keep IDs unchanged on updates and IP changes. A new ID creates a new accessory identity.

## Are all PRANA models supported?

The hardware-tested model is **210 G ERP PRO M23, firmware 49**. Other Wi-Fi units must implement the same API; they are not hardware-verified. Bluetooth-only units are unsupported.

The API's model label can differ from the printed commercial name. A label difference alone does not establish incompatibility, and a custom `model` label cannot make an incompatible unit work.

## Can I choose another name or room?

Yes. `PRANA ventilation` is a generic example, not a room assumption. Choose any clear name and assign a room in Apple Home. Home may retain an existing name; rename there if editing the plugin name has no effect.

## Why do modes change when I adjust speed?

Manual speed exits AUTO/AUTO+. Minimum/maximum speeds determine Night/Boost on firmware 49. Turning Night off selects step 2; turning Boost off selects the step below maximum. Both leave automatic modes. [Control behavior](configuration.md#operating-modes).

## Why are sensors or functions missing?

Only reported sensors become services. Up to four temperature fields are supported; the tested unit returned three. Restart after firmware adds fields. VOC, pressure, brightness, sleep timer, filter condition and efficiency are outside this release's mapping. [Limitations](configuration.md#functions-kept-in-the-prana-app).

## Does it work without internet?

The plugin-to-unit link is local and uses no PRANA cloud account. Your LAN, unit and Homebridge host must stay available. Manufacturer updates/cloud features and Apple's remote Home services have their own internet requirements.

Remote Home access depends on Apple's current home-hub requirements. This plugin does not provide its own remote-access server.

## Can I run it on a laptop? Do I need Home Assistant?

Homebridge needs a host that stays available: a sleeping/disconnected laptop cannot serve as an always-on bridge. The verified host is a Raspberry Pi 3 Model B+; use other hosts according to Homebridge's requirements.

Home Assistant, HACS, MQTT and a Bluetooth gateway are unnecessary. Configure the PRANA's local address in this plugin.

## Network and privacy

The unit API is unauthenticated HTTP. Keep it on a trusted LAN and do not forward its port to the internet. Segmented networks must permit Homebridge to reach the configured HTTP port and satisfy HomeKit's networking needs.

The plugin has no analytics or cloud login. Runtime requests go to your configured host. A manufacture identifier is stored locally in the accessory cache for identity checks and HomeKit metadata. Downloading software from GitHub/npm is separate from runtime ventilation control.

## Asking for help

[Open an issue](https://github.com/viames/homebridge-prana-local/issues/new/choose) with model, firmware, Homebridge/Node versions, OS, installation method, expected result and a short redacted log excerpt. State which controls you actually tried; connecting alone does not verify every feature.

Omit passwords, pairing codes, tokens, full configuration files, public IPs and manufacture IDs.
