# vendor/

## gospelo-mermaid-arch-0.1.0-f4cb484.tgz

`@gospelo/mermaid-arch` is not on npm. This tarball was made with `npm pack`
from a clean checkout of a commit on its `main`, following "Use in other
projects (tarball)" in the mermaid-arch README.

| | |
|---|---|
| Repository | https://github.com/gospelo-dev/mermaid-arch |
| Commit | `f4cb48407dbb0cf460dc8e082f5c791e22ec5631` |
| Size | 1,981,040 bytes (48 files) |
| sha256 | `7b61c6ee08d24a69aa1a13ee7e8cce5bef21915d511396daefefc521bd0baf88` |
| npm integrity | `sha512-Lq3v+1260+nq90xwxEX7cHQRWBqwe8fkSyQWYWzY3Ec+A0pRBw8xRjVU0NMKQp9NuF6601nhRD0rfQdxj8LGcw==` |

It contains mermaid-arch's built `dist/`, the vendored Mermaid 12.3.0 and
Font Awesome Free 6.7.2, and their licenses. `package-lock.json` records the
integrity, so `npm ci` fails if the file is changed.

To update: get a new tarball from mermaid-arch (named
`gospelo-mermaid-arch-<version>-<short commit>.tgz`), replace this one,
update the `file:` path in `package.json`, run `npm install`, and update the
table above.
