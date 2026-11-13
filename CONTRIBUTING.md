# Contributing

[← Overview](README.md)

Hardware reports, clear bug reports and focused pull requests are welcome. Use the [issue forms](https://github.com/viames/homebridge-prana-local/issues/new/choose) and distinguish what you observed from what you expect.

## Development

Use Node.js 22, 24 or 26 for the current HAP test dependency:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm pack --dry-run
```

Runtime is dependency-free CommonJS. Tests use a local HTTP simulator and real HAP-NodeJS services. They do not contact a physical ventilation unit. `PRANA_TEST_HAP_MODULE` can select another installed HAP implementation for compatibility checks.

For hardware testing, save the unit's initial state, change one ventilation setting at a time and restore the initial settings. Do not describe untested heater, winter or other behavior as hardware-verified. Keep all real credentials, identifiers and network captures outside the repository.

## Changes and verification

- Keep changes focused and retain stable accessory IDs/service subtypes.
- Cover behavior changes with meaningful tests, especially command ordering, discrete speed conversion and offline recovery.
- Report the tested model, firmware, Node/Homebridge versions and exact controls exercised.
- Keep English and Italian documentation aligned. Use generic names such as `PRANA ventilation` / `Ventilazione PRANA` and IDs such as `prana-1`; never assume an installation room.
- Use reserved documentation addresses in published examples. Explain that users must replace them.
- Check local Markdown links, fenced JSON and package contents after documentation changes.

## Release checklist

1. Run checks and review CI on the exact commit.
2. Update version/changelog and versioned install links together.
3. Build with `npm pack`, inspect the file list and create SHA256SUMS.
4. Publish the matching source tag and GitHub release archive.
5. Confirm download checksum, documentation images and links.

The plugin is distributed on GitHub, not npm. Repository code changes do not automatically update a user's installed archive or deployed Homebridge instance.
