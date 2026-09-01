const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

let repository;
try {
  repository = require("./linux-arm64-arch-repo.cjs");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

const version = "0.0.38-nightly.20260901.1244";
const packageName =
  "t3code-nightly-bin-0.0.38_nightly.20260901.1244-1-aarch64.pkg.tar.zst";

test("derives the project Pages pacman server URL", () => {
  assert.equal(typeof repository?.repositoryServerUrl, "function");
  assert.equal(
    repository.repositoryServerUrl("sppidy/t3code"),
    "https://sppidy.github.io/t3code/$arch",
  );
});

test("uses a custom Pages origin for the pacman server URL", () => {
  assert.equal(typeof repository?.repositoryServerUrl, "function");
  assert.equal(
    repository.repositoryServerUrl(
      "sppidy/t3code",
      "https://t3-repo.sppidy.in",
    ),
    "https://t3-repo.sppidy.in/$arch",
  );
});

test("materializes a symlink-free repository site with install instructions", async (context) => {
  assert.equal(typeof repository?.materializeRepositorySite, "function");

  const siteDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "t3code-arm64-arch-repo-"),
  );
  context.after(() => fs.rmSync(siteDirectory, { recursive: true, force: true }));

  const architectureDirectory = path.join(siteDirectory, "aarch64");
  fs.mkdirSync(architectureDirectory);
  fs.writeFileSync(path.join(architectureDirectory, packageName), "package");
  fs.writeFileSync(
    path.join(architectureDirectory, `${packageName}.sha256`),
    `feedface  ${packageName}\n`,
  );
  fs.writeFileSync(
    path.join(architectureDirectory, "t3code-arm64.db.tar.zst"),
    "database",
  );
  fs.writeFileSync(
    path.join(architectureDirectory, "t3code-arm64.files.tar.zst"),
    "files database",
  );
  fs.symlinkSync(
    "t3code-arm64.db.tar.zst",
    path.join(architectureDirectory, "t3code-arm64.db"),
  );
  fs.symlinkSync(
    "t3code-arm64.files.tar.zst",
    path.join(architectureDirectory, "t3code-arm64.files"),
  );

  const result = await repository.materializeRepositorySite({
    siteDirectory,
    githubRepository: "sppidy/t3code",
    pagesBaseUrl: "https://t3-repo.sppidy.in",
    version,
    packageName,
  });

  assert.deepEqual(result, {
    serverUrl: "https://t3-repo.sppidy.in/$arch",
    packageName,
  });

  const databaseAlias = path.join(architectureDirectory, "t3code-arm64.db");
  const filesAlias = path.join(architectureDirectory, "t3code-arm64.files");
  assert.equal(fs.lstatSync(databaseAlias).isFile(), true);
  assert.equal(fs.lstatSync(databaseAlias).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(databaseAlias, "utf8"), "database");
  assert.equal(fs.lstatSync(filesAlias).isFile(), true);
  assert.equal(fs.lstatSync(filesAlias).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(filesAlias, "utf8"), "files database");

  const rootIndex = fs.readFileSync(path.join(siteDirectory, "index.html"), "utf8");
  assert.match(rootIndex, /\[t3code-arm64\]/);
  assert.match(rootIndex, /SigLevel = Optional TrustAll/);
  assert.match(rootIndex, /https:\/\/t3-repo\.sppidy\.in\/\$arch/);
  assert.match(rootIndex, /sudo pacman -Syu t3code-nightly-bin/);
  assert.match(rootIndex, new RegExp(`aarch64/${packageName}`));

  const architectureIndex = fs.readFileSync(
    path.join(architectureDirectory, "index.html"),
    "utf8",
  );
  assert.match(architectureIndex, new RegExp(`href="${packageName}"`));
  assert.match(architectureIndex, new RegExp(`T3 Code ARM64 ${version}`));
});

test("rejects a package filename that does not match the selected nightly", async (context) => {
  assert.equal(typeof repository?.materializeRepositorySite, "function");

  const siteDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "t3code-arm64-arch-repo-invalid-"),
  );
  context.after(() => fs.rmSync(siteDirectory, { recursive: true, force: true }));

  await assert.rejects(
    repository.materializeRepositorySite({
      siteDirectory,
      githubRepository: "sppidy/t3code",
      version,
      packageName:
        "t3code-nightly-bin-0.0.38_nightly.20260901.1243-1-aarch64.pkg.tar.zst",
    }),
    /does not match nightly version/,
  );
});
