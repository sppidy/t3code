const fs = require("node:fs/promises");
const path = require("node:path");

const NIGHTLY_VERSION = /^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/;
const GITHUB_REPOSITORY = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+)$/;

function repositoryServerUrl(githubRepository) {
  const match = GITHUB_REPOSITORY.exec(githubRepository);
  if (!match) throw new Error(`Invalid GitHub repository: ${githubRepository}`);

  const [, owner, repository] = match;
  return `https://${owner.toLowerCase()}.github.io/${repository}/$arch`;
}

function expectedPackageName(version) {
  if (!NIGHTLY_VERSION.test(version)) {
    throw new Error(`Invalid nightly version: ${version}`);
  }

  const archPkgver = version.replace("-nightly.", "_nightly.");
  return `t3code-nightly-bin-${archPkgver}-1-aarch64.pkg.tar.zst`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderRootIndex({ serverUrl, version, packageName }) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>T3 Code ARM64 Arch repository</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:52rem;margin:3rem auto;padding:0 1rem;color:#202124}pre{overflow:auto;padding:1rem;background:#f4f4f4;border-radius:.5rem}code{font-family:ui-monospace,monospace}</style>
<h1>T3 Code ARM64 Arch repository</h1>
<p>Current package: <a href="./aarch64/${escapeHtml(packageName)}">T3 Code ARM64 ${escapeHtml(version)}</a></p>
<p>Add this repository to <code>/etc/pacman.conf</code>:</p>
<pre><code>[t3code-arm64]
SigLevel = Optional TrustAll
Server = ${escapeHtml(serverUrl)}</code></pre>
<p>Then install or update T3 Code:</p>
<pre><code>sudo pacman -Syu t3code-nightly-bin</code></pre>
</html>
`;
}

function renderArchitectureIndex({ version, packageName }) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>T3 Code ARM64 ${escapeHtml(version)}</title>
<h1>T3 Code ARM64 ${escapeHtml(version)}</h1>
<ul>
  <li><a href="${escapeHtml(packageName)}">${escapeHtml(packageName)}</a></li>
  <li><a href="${escapeHtml(packageName)}.sha256">SHA-256 checksum</a></li>
  <li><a href="t3code-arm64.db">pacman repository database</a></li>
</ul>
</html>
`;
}

async function assertRegularFile(filePath, label) {
  let metadata;
  try {
    metadata = await fs.lstat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${label} is missing: ${filePath}`);
    throw error;
  }
  if (!metadata.isFile()) throw new Error(`${label} is not a regular file: ${filePath}`);
}

async function replaceAliasWithCopy(source, destination) {
  await assertRegularFile(source, "Repository archive");

  try {
    const metadata = await fs.lstat(destination);
    if (!metadata.isFile() && !metadata.isSymbolicLink()) {
      throw new Error(`Repository alias is not replaceable: ${destination}`);
    }
    await fs.unlink(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.copyFile(source, destination);
}

async function materializeRepositorySite({
  siteDirectory,
  githubRepository,
  version,
  packageName,
}) {
  const expected = expectedPackageName(version);
  if (packageName !== expected) {
    throw new Error(`Package filename does not match nightly version: ${packageName}`);
  }

  const serverUrl = repositoryServerUrl(githubRepository);
  const architectureDirectory = path.join(siteDirectory, "aarch64");
  await assertRegularFile(path.join(architectureDirectory, packageName), "Arch package");
  await assertRegularFile(
    path.join(architectureDirectory, `${packageName}.sha256`),
    "Arch package checksum",
  );

  await replaceAliasWithCopy(
    path.join(architectureDirectory, "t3code-arm64.db.tar.zst"),
    path.join(architectureDirectory, "t3code-arm64.db"),
  );
  await replaceAliasWithCopy(
    path.join(architectureDirectory, "t3code-arm64.files.tar.zst"),
    path.join(architectureDirectory, "t3code-arm64.files"),
  );

  await fs.writeFile(
    path.join(siteDirectory, "index.html"),
    renderRootIndex({ serverUrl, version, packageName }),
    "utf8",
  );
  await fs.writeFile(
    path.join(architectureDirectory, "index.html"),
    renderArchitectureIndex({ version, packageName }),
    "utf8",
  );

  return { serverUrl, packageName };
}

async function run({ env = process.env, logger = console.log } = {}) {
  const required = [
    "REPOSITORY_SITE_DIR",
    "GITHUB_REPOSITORY",
    "VERSION",
    "PACKAGE_NAME",
  ];
  for (const name of required) {
    if (!env[name]) throw new Error(`${name} is required`);
  }

  const result = await materializeRepositorySite({
    siteDirectory: env.REPOSITORY_SITE_DIR,
    githubRepository: env.GITHUB_REPOSITORY,
    version: env.VERSION,
    packageName: env.PACKAGE_NAME,
  });
  logger(`Prepared ${result.serverUrl} for ${result.packageName}`);
  return result;
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { materializeRepositorySite, repositoryServerUrl, run };
