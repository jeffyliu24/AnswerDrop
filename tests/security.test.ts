import assert from "node:assert/strict";
import test from "node:test";
import { scanMarkdown } from "../src/security/index.js";
import { rules } from "../src/security/rules.js";
import { isPublicIp, validateRemoteUrl } from "../src/resources/localize.js";

test("scanner rules are independent and source offsets are usable for redaction", () => {
  const markdown = "Contact Ada at ada@example.org from 192.168.1.23";
  const emailRule = rules.find((rule) => rule.id === "email");
  assert.ok(emailRule);
  const result = scanMarkdown(markdown, [emailRule]);
  assert.equal(result.length, 1);
  assert.equal(result[0].match, "ada@example.org");
  assert.equal(markdown.slice(result[0].start, result[0].end), result[0].match);
  assert.equal(
    scanMarkdown(markdown.replace(result[0].match, "[REDACTED]"), [emailRule])
      .length,
    0,
  );
});

test("scanner detects representative sensitive patterns without duplicate overlaps", () => {
  const content = [
    "github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
    "AKIAABCDEFGHIJKLMNOP",
    "Bearer abcdefghijklmnopqrstuvwxyz123456",
    "/Users/alex/.ssh/id_ed25519",
    "C:\\Users\\alex\\report.md",
    "10.2.3.4",
    "GITHUB_TOKEN=abcdefghijklmnopqrstuvwxyz123456",
  ].join("\n");
  const ids = scanMarkdown(content).map((finding) => finding.ruleId);
  for (const expected of [
    "github-token",
    "openai-key",
    "aws-key",
    "bearer-token",
    "ssh-path",
    "windows-path",
    "private-ip",
    "secret-env",
  ]) {
    assert.ok(ids.includes(expected), `${expected} missing`);
  }
  assert.equal(
    scanMarkdown("Public endpoint: 8.8.8.8").some(
      (finding) => finding.ruleId === "private-ip",
    ),
    false,
  );
});

test("remote resource policy rejects local and reserved addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.2",
    "172.16.0.2",
    "192.168.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2002:0a00:0001::1",
    "2001::1",
  ]) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
  for (const url of [
    "http://localhost/x.png",
    "http://127.0.0.1/x.png",
    "http://[::1]/x.png",
    "https://169.254.169.254/latest",
    "file:///etc/passwd",
    "http://example.org:8080/a.png",
    "http://user:pass@example.org/a.png",
  ]) {
    assert.throws(() => validateRemoteUrl(url), /.+/, url);
  }
  assert.equal(
    validateRemoteUrl("https://example.org/a.png#fragment").hash,
    "",
  );
});
