# Installation, updates and removal

[← Overview](../README.md) · [Settings](configuration.md) · [Help](troubleshooting.md) · [Italiano](../README.it.md#installazione)

## Before you begin

You need Homebridge and a Wi-Fi PRANA with firmware 49+, exposing its local HTTP API. Check the [compatibility evidence](../README.md#compatibility).

Back up Homebridge's configuration and pairing data using your installation's backup tool. Keep the plugin archive separately: installations from GitHub may not be included in Homebridge backups.

## 1. Find the unit's address

1. Confirm the PRANA works in its own app and is connected to Wi-Fi.
2. Find it in your router's connected-device list. Use its IPv4 address or a hostname that resolves on the Homebridge host.
3. Reserve the address in your router, when possible, so it will remain stable.

For a read-only API check, open `http://YOUR-PRANA-IP/info` on the same network. Compatible units return JSON with `isValid: true` and firmware 49+. Do not share the response publicly: it includes the manufacture identifier.

The HTTP API normally uses **port 80**. A PRANA mDNS service may advertise port 12345; that is not the HTTP API port. [Connection checks](troubleshooting.md#the-unit-will-not-connect).

## 2. Install the plugin

In **Homebridge UI → Plugins**, search for `homebridge-prana-local` and install it. For terminal installation, open your Homebridge installation's terminal or connect to its host by SSH.

### Official Raspberry Pi image / apt installation

In the Homebridge UI terminal, use the standard storage directory:

```sh
cd /var/lib/homebridge
npm install --omit=dev --ignore-scripts homebridge-prana-local@0.1.2
```

Use the account that owns that directory. An SSH session may need to switch to the Homebridge service account first. Do not change directory ownership or install another Homebridge copy to resolve a permissions error.

**Expected result:** npm installs `homebridge-prana-local`. After a Homebridge restart, it appears in Plugins. No build step, runtime dependencies or install scripts are required.

### Global npm installation

If your existing Homebridge plugins are installed globally:

```sh
npm install -g --omit=dev --ignore-scripts homebridge-prana-local@0.1.2
```

Follow your existing privilege convention. Some system-wide setups need `sudo`; user-managed Node installations normally do not.

### Docker, NAS and other layouts

Use your container/NAS installer's documented plugin installation mechanism. Install the plugin into **the directory used by the running Homebridge**, with persistent storage across container recreation.

### Alternative: GitHub archive

The [GitHub release](https://github.com/viames/homebridge-prana-local/releases/latest) also includes a ready-to-run archive. In the same plugin directory, you can install it with:

```sh
npm install --omit=dev --ignore-scripts https://github.com/viames/homebridge-prana-local/releases/download/v0.1.2/homebridge-prana-local-0.1.2.tgz
```

An “install version” dialog may expect an npm name/version rather than an arbitrary URL. Use a terminal when your UI does not explicitly support archive URLs.

### Verify a downloaded archive

The [release page](https://github.com/viames/homebridge-prana-local/releases/latest) includes `.tgz` and `SHA256SUMS`. After downloading both into the same directory:

```sh
# macOS
shasum -a 256 -c SHA256SUMS

# Linux
sha256sum -c SHA256SUMS
```

The result should be `OK`.

## 3. Configure

Open **Plugins → Homebridge Prana Local → Plugin Actions → Plugin Config** in Homebridge UI 5.29. Other versions may call this **Settings**, and may display the package as `homebridge-prana-local`.

| Field | Example / meaning |
| --- | --- |
| Stable ID | `prana-1`: unique and permanent |
| Name in Apple Home | `PRANA ventilation`: choose your own name |
| IP address or hostname | Your unit's address, without `http://` or a path |
| Model label | Optional commercial model printed on the unit |

Keep separate-flow controls disabled unless you need them. Set `language` to `it` for Italian or `en` for English. Save the settings.

Alternatively, add the [minimal JSON](configuration.md#minimal-configuration) to the existing `platforms` array. Preserve your bridge block and other plugins.

## 4. Restart and check

Restart Homebridge once and look for:

```text
[Prana Local] PRANA ventilation: connected (firmware 49)
```

The accessory name reflects your chosen name. Startup reads state without changing the unit's mode.

- **Already paired bridge:** open Apple Home and check its assigned/default room.
- **New bridge or child bridge:** pair it once using that bridge's QR code.
- **Grouped controls:** inspect the main fan's accessory settings and use **Show as Separate Tiles**, where available.

Assign the accessory to your chosen room.

## Updating and rollback

1. Back up configuration/pairing data and read the [release notes](https://github.com/viames/homebridge-prana-local/releases).
2. Use Homebridge UI or the original installation method and location with the new package version.
3. Keep device IDs unchanged, then restart and check the connected message.

Updates are available through npm and GitHub releases. To roll back, install the previous npm version or its matching archive in the same location. Restore configuration only when the release notes describe a configuration change. Removing the entire bridge from Apple Home is not an update step.

## Removing

To remove one unit while keeping the plugin, delete its entry from `devices` and restart. The running platform unregisters accessories removed from its device list.

For full removal, back up first, remove the `PranaLocal` platform entry, then uninstall through your plugin manager. Local npm installs use `npm uninstall homebridge-prana-local` in the original directory; global installs use `npm uninstall -g homebridge-prana-local`. Restart Homebridge.

If a cached accessory remains after removing the entire platform, remove **only that PRANA accessory** through Homebridge's cached-accessory management. Deleting/re-pairing the whole bridge is unnecessary. The PRANA remains usable with its own app and remote.
