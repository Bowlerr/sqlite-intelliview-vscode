# Contributing to SQLite IntelliView

Thank you for your interest in contributing! We welcome pull requests, bug reports, and feature suggestions.

## How to Contribute

1. **Fork the repository**
2. **Create a new branch** for your feature or bugfix
3. **Make your changes** with clear, descriptive commit messages
4. **Test your changes** to ensure nothing is broken
5. **Submit a pull request** to the `main` branch

## Code Guidelines

- Use clear, consistent code style (TypeScript/JavaScript best practices)
- Write descriptive commit messages
- Add or update tests for new features or bug fixes
- Update documentation as needed

## Local validation

Install dependencies with `npm ci`. Run `npm run check-types`, `npm run lint`,
and `npm run build` before submitting a change. Lint is read-only; use
`npm run lint:fix` when you intend to apply fixes.

- `npm run test:unit` runs the database and message-contract tests under Node with
  the VS Code configuration/notification API mocked. SQLite operations use real sql.js databases.
- `npm run test:webview` runs the browser DOM regressions with Node's test runner and JSDOM.
- `npm test` runs the TypeScript suites in a VS Code extension host. On Linux,
  use `xvfb-run -a npm test` when a display is unavailable.
- `npx vsce package --no-yarn` checks extension packaging without publishing.

CI runs the webview tests and extension-host tests. The Node-only suite is useful
for development in environments where the extension host cannot start; it does
not replace extension-host validation. Local database fixtures and test sources
are excluded from the VSIX.

## Reporting Issues

- Use [GitHub Issues](https://github.com/Bowlerr/sqlite-intelliview-vscode/issues) for bugs and feature requests
- Provide as much detail as possible (steps to reproduce, screenshots, logs)

## Code of Conduct

Be respectful and inclusive. We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## Questions?

Open an issue or start a discussion in the repository.

---

Thank you for helping make SQLite IntelliView better!
