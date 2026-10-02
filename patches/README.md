# Dependency compatibility patches

Keep the app on Expo SDK 54 rather than introducing a native SDK migration as
part of dependency security remediation. `npm run postinstall` applies these
patches and fails if they no longer apply.

- **expo-asset:** Preserve the existing HTTPS asset loading fix for Expo Go
  behind the Replit proxy. This is still necessary in the SDK 54 patch release.
- **metro:** The security-fixed image-size 2 exports `imageSize` instead of a
  callable CommonJS module, and accepts bytes instead of file paths. Adapt both
  Metro image loading paths; do not downgrade image-size to the vulnerable 1.x
  release to fix a bundling error.
- **query-string:** The security-fixed decode-uri-component 0.5 is ESM. Use its
  default export in the legacy CommonJS consumer. Keep this patch until Expo
  Router stops using query-string 7.
- **node-forge:** Version 1.4.0 is the latest published release but still accepts
  extra elements in a nested DigestAlgorithm sequence (CVE-2026-85393,
  scanner finding GHSA-86w9-cpqp-85rv). Backport the RSA verification fix from
  https://github.com/digitalbazaar/forge/pull/1152. A regression test checks both
  valid signatures and malformed nested structures using an exponent-3 key.
  Do not suppress or disguise the version-based scanner finding: it remains
  visible until an upstream release includes this fix.

`npm run test:dependencies` checks these integration boundaries along with
thumbnail generation, UUID consumers, and schema validation. When updating
patched packages, review the new implementations rather than merely renaming
the patch files. Build web, iOS, and Android bundles to check Metro's ESM handling.