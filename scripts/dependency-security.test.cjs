const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { generateKeyPairSync } = require("node:crypto");

test("query-string decodes URL parameters using the patched ESM decoder", () => {
  const queryString = require("query-string");
  assert.deepEqual(
    { ...queryString.parse("code=abc%2B123&state=hello%20world&label=%E2%9C%93") },
    { code: "abc+123", state: "hello world", label: "✓" },
  );
  assert.equal(queryString.parse("value=%E0%A4%A").value, "%E0%A4%A");
});

test("Metro reads both image buffers and image filenames with image-size 2", async () => {
  // Metro does not export this internal module as a package subpath.
  const metroAssets = require(path.join(
    path.dirname(require.resolve("metro/package.json")),
    "src/Assets.js",
  ));
  const imagePath = path.join(
    path.dirname(require.resolve("expo-router/package.json")),
    "assets/unmatched.png",
  );
  const size = metroAssets.getAssetSize("png", fs.readFileSync(imagePath), imagePath);
  assert.ok(size.width > 0 && size.height > 0);
  const asset = await metroAssets.getAssetData(imagePath, "unmatched.png", [], null, "/assets");
  assert.equal(asset.width, size.width);
  assert.equal(asset.height, size.height);
  assert.equal(metroAssets.getAssetSize("txt", Buffer.from("text"), "text.txt"), null);
});

test("xcode can generate project IDs with the CommonJS-compatible uuid update", () => {
  const project = require("xcode").project("/tmp/security-smoke.pbxproj");
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});

test("ngrok can still resolve uuid.v4 without starting a tunnel", () => {
  const ngrokRequire = createRequire(require.resolve("@expo/ngrok"));
  const uuid = ngrokRequire("uuid");
  assert.ok(uuid.validate(uuid.v4()));
  assert.equal(typeof require("@expo/ngrok").connect, "function");
});

test("sharp can generate the app's JPEG thumbnails", async () => {
  const sharp = require("sharp");
  const thumbnail = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#0D9488" },
  }).resize({ width: 300, withoutEnlargement: true }).jpeg({ quality: 60 }).toBuffer();
  const metadata = await sharp(thumbnail).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 10);
});

test("Drizzle and drizzle-zod remain compatible with the existing schema API", () => {
  const { pgTable, text } = require("drizzle-orm/pg-core");
  const { createInsertSchema } = require("drizzle-zod");
  const table = pgTable("security_smoke", { name: text("name").notNull() });
  const schema = createInsertSchema(table);
  assert.deepEqual(schema.parse({ name: "test" }), { name: "test" });
  assert.equal(schema.safeParse({}).success, false);
});

test("the Expo Go HTTPS asset patch remains installed after dependency updates", () => {
  const assetSource = fs.readFileSync(path.join(
    path.dirname(require.resolve("expo-asset/package.json")),
    "build/AssetSources.js",
  ), "utf8");
  assert.ok(assetSource.includes("manifestBaseUrl?.startsWith('https://')"));
  assert.ok(assetSource.includes("scheme + manifest2.extra.expoGo.debuggerHost"));
});

test("node-forge rejects extra nested DigestAlgorithm elements but accepts valid signatures", () => {
  const forge = require("node-forge");
  const { privateKey: pem } = generateKeyPairSync("rsa", {
    modulusLength: 1024,
    publicExponent: 3,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  const privateKey = forge.pki.privateKeyFromPem(pem);
  const publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);
  const md = forge.md.sha256.create().update("security regression");
  const digest = md.digest().getBytes();
  assert.equal(publicKey.verify(digest, privateKey.sign(md)), true);

  const asn1 = forge.asn1;
  const algorithm = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false,
      asn1.oidToDer(forge.pki.oids.sha256).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""),
    // Previously ignored by asn1.validate: the unconsumed interior padding.
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, "garbage"),
  ]);
  const digestInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    algorithm,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
  ]);
  const signature = privateKey.sign(md, {
    encode: () => asn1.toDer(digestInfo).getBytes(),
  });
  assert.throws(() => publicKey.verify(digest, signature), /valid RSASSA-PKCS1-v1_5/);
});