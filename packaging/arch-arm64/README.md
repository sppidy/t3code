# T3 Code nightly for Arch Linux ARM64

The `Linux ARM64 Nightly` workflow builds `t3code-nightly-bin` for native
`aarch64`, publishes the package on the matching fork prerelease, and updates
the rolling pacman repository on GitHub Pages.

Add the repository to `/etc/pacman.conf`:

```ini
[t3code-arm64]
SigLevel = Optional TrustAll
Server = https://sppidy.github.io/t3code/$arch
```

Then synchronize package databases and install T3 Code:

```bash
sudo pacman -Syu t3code-nightly-bin
```

Future `pacman -Syu` runs update T3 Code when the workflow publishes a newer
nightly. This personal repository is delivered over HTTPS but intentionally
does not sign its database or packages, so the repository-specific
`Optional TrustAll` setting is required.

The PKGBUILD is CI-oriented. It consumes the already built and verified
AppImage plus the exact upstream license through the `T3CODE_*` environment
variables supplied by the workflow; it does not download another build.
