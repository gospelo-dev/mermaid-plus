# Third-party notices

The TypeScript version of this skill renders diagrams with
`@gospelo/mermaid-arch` (`vendor/gospelo-mermaid-arch-*.tgz`), which bundles
the following. Their full license texts are inside the tarball.

| Component | License |
|---|---|
| [@gospelo/mermaid-arch](https://github.com/gospelo-dev/mermaid-arch) | MIT |
| [Mermaid](https://github.com/mermaid-js/mermaid) 12.3.0 | MIT |
| [Font Awesome Free](https://fontawesome.com) 6.7.2 | Icons: CC BY 4.0, fonts: SIL OFL 1.1, code: MIT |

## Font Awesome icons in rendered images

`fa:fa-*` icons in diagram labels are drawn with Font Awesome Free. The
icon artwork is licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), and the
attribution embedded in the CSS and font files does not carry over into the
PNG images this skill produces. When you publish those images, credit Font
Awesome near them or in your project, for example:

> Icons by [Font Awesome](https://fontawesome.com) (CC BY 4.0)

## AWS Architecture Icons

The AWS icon package is not bundled. You supply it yourself
(`--icons-zip`) under AWS's own terms; publish only the rendered images.
