import assert from "node:assert/strict";
import test from "node:test";
import {
  describeDevice,
  getClientIp,
  getRequestGeo,
  isPublicIp,
  normalizeDeviceKey,
  normalizeFailureReason,
  normalizeGpsLocation,
  parseIpinfoResponse,
  parseNetlifyGeo,
  parseUserAgent,
} from "../lib/login-audit.ts";

const headers = (values) => ({ get: (name) => values[name.toLowerCase()] ?? null });

test("parses common user agents", () => {
  assert.deepEqual(
    parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"),
    { browser: "Chrome 130", os: "Windows 10/11", deviceType: "desktop" }
  );
  assert.deepEqual(
    parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68"),
    { browser: "Edge 130", os: "Windows 10/11", deviceType: "desktop" }
  );
  assert.deepEqual(
    parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"),
    { browser: "Safari 17", os: "iOS 17.1", deviceType: "mobile" }
  );
  assert.deepEqual(
    parseUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"),
    { browser: "Chrome 129", os: "Android 14", deviceType: "mobile" }
  );
  assert.deepEqual(
    parseUserAgent("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"),
    { browser: "Chrome 129", os: "Android 13", deviceType: "tablet" }
  );
  assert.deepEqual(
    parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"),
    { browser: "Safari 18", os: "macOS", deviceType: "desktop" }
  );
  assert.deepEqual(parseUserAgent(null), { browser: null, os: null, deviceType: "desktop" });
});

test("describes a device with fallbacks", () => {
  assert.equal(describeDevice({ os: "Windows 10/11", browser: "Chrome 130" }), "Windows 10/11 · Chrome 130");
  assert.equal(describeDevice({ os: null, browser: "Chrome 130" }), "Chrome 130");
  assert.equal(describeDevice({ os: null, browser: null }), "ບໍ່ຮູ້ຈັກອຸປະກອນ");
});

test("reads the client IP from proxy headers", () => {
  assert.equal(getClientIp(headers({ "x-forwarded-for": "115.84.1.2, 10.0.0.1" })), "115.84.1.2");
  assert.equal(getClientIp(headers({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" })), "203.0.113.9");
  assert.equal(getClientIp(headers({ "cf-connecting-ip": "2001:db8::1", "x-real-ip": "203.0.113.9" })), "2001:db8::1");
  assert.equal(getClientIp(headers({ "x-forwarded-for": "::ffff:192.168.1.5" })), "192.168.1.5");
  assert.equal(getClientIp(headers({ "x-forwarded-for": "192.168.1.5:51234" })), "192.168.1.5");
  assert.equal(getClientIp(headers({})), null);
});

test("reads geo headers and decodes city names", () => {
  assert.deepEqual(
    getRequestGeo(headers({ "x-vercel-ip-country": "la", "x-vercel-ip-country-region": "VT", "x-vercel-ip-city": "Vientiane%20Capital" })),
    { country: "LA", region: "VT", city: "Vientiane Capital", latitude: null, longitude: null }
  );
  assert.deepEqual(getRequestGeo(headers({ "cf-ipcountry": "XX" })), { country: null, region: null, city: null, latitude: null, longitude: null });
});

test("reads Netlify's client IP and base64 geo header", () => {
  assert.equal(getClientIp(headers({ "x-nf-client-connection-ip": "115.84.1.2", "x-forwarded-for": "10.0.0.1" })), "115.84.1.2");
  const geo = { city: "ວຽງຈັນ", country: { code: "LA", name: "Laos" }, subdivision: { code: "VT", name: "Vientiane Prefecture" }, latitude: 17.97, longitude: 102.6 };
  const encoded = Buffer.from(JSON.stringify(geo), "utf8").toString("base64");
  assert.deepEqual(getRequestGeo(headers({ "x-nf-geo": encoded })), {
    country: "LA", region: "Vientiane Prefecture", city: "ວຽງຈັນ", latitude: 17.97, longitude: 102.6,
  });
  assert.equal(parseNetlifyGeo(JSON.stringify(geo)).city, "ວຽງຈັນ");
  assert.equal(parseNetlifyGeo("garbage"), null);
  assert.equal(parseNetlifyGeo(null), null);
});

test("only public IPs are looked up", () => {
  for (const ip of ["115.84.1.2", "2400:cb00::1"]) assert.equal(isPublicIp(ip), true, ip);
  for (const ip of [null, "127.0.0.1", "10.1.2.3", "192.168.1.5", "172.20.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "not-an-ip"]) {
    assert.equal(isPublicIp(ip), false, String(ip));
  }
});

test("parses ipinfo.io responses", () => {
  assert.deepEqual(
    parseIpinfoResponse({ ip: "115.84.1.2", city: "Vientiane", region: "Vientiane Prefecture", country: "LA", loc: "17.9667,102.6000", org: "AS131192 Unitel" }),
    { isp: "Unitel", country: "LA", region: "Vientiane Prefecture", city: "Vientiane", latitude: 17.9667, longitude: 102.6 }
  );
  assert.equal(parseIpinfoResponse({ ip: "10.0.0.1", bogon: true }), null);
  assert.equal(parseIpinfoResponse(null), null);
  assert.deepEqual(parseIpinfoResponse({ loc: "bad" }), { isp: null, country: null, region: null, city: null, latitude: null, longitude: null });
});

test("validates browser GPS reports", () => {
  assert.deepEqual(normalizeGpsLocation({ status: "granted", latitude: 17.97, longitude: 102.6, accuracy: 24.6 }), {
    status: "granted", latitude: 17.97, longitude: 102.6, accuracy: 25,
  });
  assert.deepEqual(normalizeGpsLocation({ status: "denied", latitude: 1, longitude: 2 }), { status: "denied", latitude: null, longitude: null, accuracy: null });
  assert.deepEqual(normalizeGpsLocation({ status: "granted", latitude: 200, longitude: 2 }), { status: "unavailable", latitude: null, longitude: null, accuracy: null });
  assert.equal(normalizeGpsLocation({ status: "hacked" }), null);
  assert.equal(normalizeGpsLocation("x"), null);
});

test("validates device keys and failure reasons", () => {
  assert.equal(normalizeDeviceKey("3F2504E0-4F89-41D3-9A0C-0305E82C3301"), "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  assert.equal(normalizeDeviceKey("not-a-key"), null);
  assert.equal(normalizeDeviceKey(undefined), null);
  assert.equal(normalizeFailureReason("inactive_account"), "inactive_account");
  assert.equal(normalizeFailureReason("<script>"), "wrong_password");
});
