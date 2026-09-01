const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

let resolver;
try {
  resolver = require("./linux-arm64-nightly.cjs");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

test("selects the newest published official nightly", () => {
  assert.equal(typeof resolver?.selectLatestNightly, "function");

  const selected = resolver.selectLatestNightly([
    {
      tag_name: "v0.0.38-nightly.20260831.1241",
      draft: false,
      prerelease: true,
      published_at: "2026-08-31T18:00:00Z",
    },
    {
      tag_name: "v0.0.39-nightly.20260901.1245",
      draft: true,
      prerelease: true,
      published_at: "2026-09-01T15:00:00Z",
    },
    {
      tag_name: "v0.0.38-nightly.20260901.1244",
      draft: false,
      prerelease: true,
      published_at: "2026-09-01T12:44:00Z",
    },
    {
      tag_name: "v0.0.38",
      draft: false,
      prerelease: false,
      published_at: "2026-09-01T13:00:00Z",
    },
    {
      tag_name: "nightly-v0.0.40",
      draft: false,
      prerelease: true,
      published_at: "2026-09-01T14:00:00Z",
    },
  ]);

  assert.deepEqual(selected, {
    tag: "v0.0.38-nightly.20260901.1244",
    version: "0.0.38-nightly.20260901.1244",
    publishedAt: "2026-09-01T12:44:00Z",
  });
});

test("skips a nightly already published with the ARM64 AppImage", async () => {
  assert.equal(typeof resolver?.resolveNightly, "function");

  const responses = new Map([
    [
      "https://api.github.test/repos/pingdotgg/t3code/releases?per_page=100",
      {
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: "v0.0.38-nightly.20260901.1244",
            draft: false,
            prerelease: true,
            published_at: "2026-09-01T12:44:00Z",
          },
        ],
      },
    ],
    [
      "https://api.github.test/repos/sppidy/t3code/releases/tags/linux-arm64-v0.0.38-nightly.20260901.1244",
      {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: "linux-arm64-v0.0.38-nightly.20260901.1244",
          assets: [
            { name: "T3-Code-0.0.38-nightly.20260901.1244-arm64.AppImage" },
            { name: "T3-Code-0.0.38-nightly.20260901.1244-arm64.AppImage.sha256" },
            { name: "BUILD-PROVENANCE.txt" },
          ],
        }),
      },
    ],
  ]);

  const result = await resolver.resolveNightly({
    apiUrl: "https://api.github.test",
    repository: "sppidy/t3code",
    token: "test-token",
    fetchImpl: async (url) => responses.get(url),
  });

  assert.deepEqual(result, {
    tag: "v0.0.38-nightly.20260901.1244",
    version: "0.0.38-nightly.20260901.1244",
    publishedAt: "2026-09-01T12:44:00Z",
    releaseTag: "linux-arm64-v0.0.38-nightly.20260901.1244",
    artifactName: "T3-Code-0.0.38-nightly.20260901.1244-arm64.AppImage",
    shouldBuild: false,
  });
});

test("rebuilds an incomplete fork prerelease", async () => {
  const responses = new Map([
    [
      "https://api.github.test/repos/pingdotgg/t3code/releases?per_page=100",
      {
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: "v0.0.38-nightly.20260901.1244",
            draft: false,
            prerelease: true,
            published_at: "2026-09-01T12:44:00Z",
          },
        ],
      },
    ],
    [
      "https://api.github.test/repos/sppidy/t3code/releases/tags/linux-arm64-v0.0.38-nightly.20260901.1244",
      {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: "linux-arm64-v0.0.38-nightly.20260901.1244",
          assets: [{ name: "T3-Code-0.0.38-nightly.20260901.1244-arm64.AppImage" }],
        }),
      },
    ],
  ]);

  const result = await resolver.resolveNightly({
    apiUrl: "https://api.github.test",
    repository: "sppidy/t3code",
    token: "test-token",
    fetchImpl: async (url) => responses.get(url),
  });

  assert.equal(result.shouldBuild, true);
});

test("builds a nightly that has not been published in the fork", async () => {
  const responses = new Map([
    [
      "https://api.github.test/repos/pingdotgg/t3code/releases?per_page=100",
      {
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: "v0.0.38-nightly.20260901.1244",
            draft: false,
            prerelease: true,
            published_at: "2026-09-01T12:44:00Z",
          },
        ],
      },
    ],
    [
      "https://api.github.test/repos/sppidy/t3code/releases/tags/linux-arm64-v0.0.38-nightly.20260901.1244",
      { ok: false, status: 404 },
    ],
  ]);

  const result = await resolver.resolveNightly({
    apiUrl: "https://api.github.test",
    repository: "sppidy/t3code",
    token: "test-token",
    fetchImpl: async (url) => responses.get(url),
  });

  assert.deepEqual(result, {
    tag: "v0.0.38-nightly.20260901.1244",
    version: "0.0.38-nightly.20260901.1244",
    publishedAt: "2026-09-01T12:44:00Z",
    releaseTag: "linux-arm64-v0.0.38-nightly.20260901.1244",
    artifactName: "T3-Code-0.0.38-nightly.20260901.1244-arm64.AppImage",
    shouldBuild: true,
  });
});

test("serializes the resolver contract as GitHub job outputs", () => {
  assert.equal(typeof resolver?.formatGithubOutput, "function");

  const output = resolver.formatGithubOutput({
    tag: "v0.0.38-nightly.20260901.1244",
    version: "0.0.38-nightly.20260901.1244",
    publishedAt: "2026-09-01T12:44:00Z",
    releaseTag: "linux-arm64-v0.0.38-nightly.20260901.1244",
    artifactName: "T3-Code-0.0.38-nightly.20260901.1244-arm64.AppImage",
    shouldBuild: true,
  });

  assert.equal(
    output,
    [
      "tag=v0.0.38-nightly.20260901.1244",
      "version=0.0.38-nightly.20260901.1244",
      "published_at=2026-09-01T12:44:00Z",
      "release_tag=linux-arm64-v0.0.38-nightly.20260901.1244",
      "artifact_name=T3-Code-0.0.38-nightly.20260901.1244-arm64.AppImage",
      "should_build=true",
      "",
    ].join("\n"),
  );
});

test("writes resolved values to the GitHub output file", async (context) => {
  assert.equal(typeof resolver?.run, "function");

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-arm64-nightly-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "github-output");
  const responses = new Map([
    [
      "https://api.github.test/repos/pingdotgg/t3code/releases?per_page=100",
      {
        ok: true,
        status: 200,
        json: async () => [
          {
            tag_name: "v0.0.38-nightly.20260901.1244",
            draft: false,
            prerelease: true,
            published_at: "2026-09-01T12:44:00Z",
          },
        ],
      },
    ],
    [
      "https://api.github.test/repos/sppidy/t3code/releases/tags/linux-arm64-v0.0.38-nightly.20260901.1244",
      { ok: false, status: 404 },
    ],
  ]);

  await resolver.run({
    env: {
      GITHUB_API_URL: "https://api.github.test",
      GITHUB_REPOSITORY: "sppidy/t3code",
      GITHUB_TOKEN: "test-token",
      GITHUB_OUTPUT: outputPath,
    },
    fetchImpl: async (url) => responses.get(url),
    logger: () => {},
  });

  assert.equal(
    fs.readFileSync(outputPath, "utf8"),
    [
      "tag=v0.0.38-nightly.20260901.1244",
      "version=0.0.38-nightly.20260901.1244",
      "published_at=2026-09-01T12:44:00Z",
      "release_tag=linux-arm64-v0.0.38-nightly.20260901.1244",
      "artifact_name=T3-Code-0.0.38-nightly.20260901.1244-arm64.AppImage",
      "should_build=true",
      "",
    ].join("\n"),
  );
});
