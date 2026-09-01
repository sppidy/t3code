const fs = require("node:fs/promises");

const NIGHTLY_TAG = /^v(\d+\.\d+\.\d+-nightly\.\d{8}\.\d+)$/;
const NIGHTLY_VERSION = /^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;

function deriveArchPackage(version) {
  if (!NIGHTLY_VERSION.test(version)) {
    throw new Error(`Invalid nightly version: ${version}`);
  }

  const archPkgver = version.replace("-nightly.", "_nightly.");
  return {
    archPkgver,
    packageName: `t3code-nightly-bin-${archPkgver}-1-aarch64.pkg.tar.zst`,
  };
}

function selectLatestNightly(releases) {
  const candidates = releases
    .filter((release) => release.prerelease === true && release.draft === false)
    .map((release) => {
      const match = NIGHTLY_TAG.exec(release.tag_name);
      const publishedTime = Date.parse(release.published_at);
      if (!match || !Number.isFinite(publishedTime)) return undefined;
      return {
        tag: release.tag_name,
        version: match[1],
        publishedAt: release.published_at,
        publishedTime,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.publishedTime - left.publishedTime);

  if (candidates.length === 0) {
    throw new Error("No published official nightly release was found");
  }

  const { tag, version, publishedAt } = candidates[0];
  return { tag, version, publishedAt };
}

async function resolveNightly({
  apiUrl,
  repository,
  token,
  fetchImpl = fetch,
  upstreamRepository = "pingdotgg/t3code",
}) {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const upstreamResponse = await fetchImpl(
    `${apiUrl}/repos/${upstreamRepository}/releases?per_page=100`,
    { headers },
  );
  if (!upstreamResponse?.ok) {
    throw new Error(`Could not list upstream releases: HTTP ${upstreamResponse?.status ?? "unknown"}`);
  }

  const selected = selectLatestNightly(await upstreamResponse.json());
  const releaseTag = `linux-arm64-${selected.tag}`;
  const artifactName = `T3-Code-${selected.version}-arm64.AppImage`;
  const { archPkgver, packageName } = deriveArchPackage(selected.version);
  const releaseResponse = await fetchImpl(
    `${apiUrl}/repos/${repository}/releases/tags/${encodeURIComponent(releaseTag)}`,
    { headers },
  );
  if (releaseResponse?.status === 404) {
    return {
      ...selected,
      releaseTag,
      artifactName,
      archPkgver,
      packageName,
      shouldBuild: true,
    };
  }
  if (!releaseResponse?.ok) {
    throw new Error(`Could not inspect fork release: HTTP ${releaseResponse?.status ?? "unknown"}`);
  }

  const release = await releaseResponse.json();
  const assetNames = new Set(release.assets.map((asset) => asset.name));
  const requiredAssets = [
    artifactName,
    `${artifactName}.sha256`,
    packageName,
    `${packageName}.sha256`,
    "BUILD-PROVENANCE.txt",
  ];
  const shouldBuild = requiredAssets.some((name) => !assetNames.has(name));
  return {
    ...selected,
    releaseTag,
    artifactName,
    archPkgver,
    packageName,
    shouldBuild,
  };
}

function formatGithubOutput(result) {
  return [
    `tag=${result.tag}`,
    `version=${result.version}`,
    `published_at=${result.publishedAt}`,
    `release_tag=${result.releaseTag}`,
    `artifact_name=${result.artifactName}`,
    `arch_pkgver=${result.archPkgver}`,
    `package_name=${result.packageName}`,
    `should_build=${result.shouldBuild}`,
    "",
  ].join("\n");
}

async function run({ env = process.env, fetchImpl = fetch, logger = console.log } = {}) {
  const required = ["GITHUB_API_URL", "GITHUB_REPOSITORY", "GITHUB_TOKEN", "GITHUB_OUTPUT"];
  for (const name of required) {
    if (!env[name]) throw new Error(`${name} is required`);
  }

  const result = await resolveNightly({
    apiUrl: env.GITHUB_API_URL,
    repository: env.GITHUB_REPOSITORY,
    token: env.GITHUB_TOKEN,
    fetchImpl,
  });
  await fs.appendFile(env.GITHUB_OUTPUT, formatGithubOutput(result), "utf8");
  logger(
    `${result.shouldBuild ? "Building" : "Skipping"} Linux ARM64 for ${result.tag}`,
  );
  return result;
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  deriveArchPackage,
  formatGithubOutput,
  resolveNightly,
  run,
  selectLatestNightly,
};
