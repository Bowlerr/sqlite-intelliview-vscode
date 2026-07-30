# Table Tests

Tests for `media/table.js` (and `media/utils.js`) are in the `tests/` directory.

## Running

Install dependencies and run with vitest:

```bash
npm install --save-dev vitest jsdom
npm run test-media
```

The `test-media` script should be added to `package.json`:

```json
"test-media": "vitest run"
```

Vitest config at project root (`vitest.config.js`):

```js
import {defineConfig} from 'vitest/config'
export default defineConfig({ test: { environment: 'jsdom', include: ['media/tests/**/*.test.js'] } });
```

## Files

- `table.test.js` — 12 tests covering fixes #3–#7, #10
- `helpers.js` — DOM/fixture utilities shared by tests
