# hot-esm
ESM hot-reloading for Node.js

```bash
hot ./server.js
```

## Installation
Install [hot-esm](https://yarnpkg.com/en/package/hot-esm)
by running

```sh
yarn add hot-esm
```

## In Development: Hot Module Replacement
```js
export let text = 'Hello World!'

if (import.meta.hot) {
  import.meta.hot.accept((module) => {
    text = module.text
  })
}
```

The interface that hot-esm currently provides is pretty clunky:

- It requires manual re-importing of modules without knowledge about updates
- It requires manual cleanup of side-effects when a new version of a module is
  imported

To address these problems, I'm experimenting with implementing an HMR interface
similar to those provided by bundlers. Namely, I'm taking inspiration from the
[HMR API](https://vitejs.dev/guide/api-hmr.html) provided by Vite.

### Implementation
Using the
[`globalPreload()`](https://nodejs.org/docs/latest-v17.x/api/esm.html#globalpreload)
loader hook, hot-esm creates a [global registry](/index.js#L128) to track
modules that can accept updates.

For each module that subscribes using `import.meta.hot.accept()`, hot-esm
tracks:

- The callback provided as argument
- The absolute path to the module, derived from `import.meta.url`
- A function defined within the module to re-`import()` that module. This is
  necessary because the `globalPreload()` hook does not allow dynamic
  `import()`.

In order to define `import.meta.hot.accept()` and allow it to collect the above
information, the [module source code is modified](/index.js#L95) via the
[`load()`](https://nodejs.org/docs/latest-v17.x/api/esm.html#loadurl-context-defaultload)
loader hook. In order to minimize the disruption to stack trace line numbers,
the first instance of

```js
if (import.meta.hot) {
  // Code
}
```

is, without changing the line count, replaced with:

```js
if (globalThis.hotEsm.extendImportMeta(import.meta, () => import(import.meta.url)), import.meta.hot) {
  // Code
}
```

[`globalThis.hotEsm.extendImportMeta()`](/index.js#L114-L127) then ensures that
the needed information is added to the global registry when
`import.meta.hot.accept()` is called.

When it comes to delivering updated modules to subscribers, when a module is updated,
[its file path is sent](/index.js#L44) [to the registry](/index.js#L131-L138).
From there, the callback passed to `import.meta.hot.accept()` is called with the
updated module.

### Ongoing Work
I plan to try this interface against a few usecases before:

- Looking for a more robust way to modify the module source code
- Potentially expanding the interface of `import.meta.hot.accept()` to allow
  modules to accept updates for direct dependencies.
- Potentially implementing other methods from Vite's HMR API.

## Usage
hot-esm provides a
[loader](https://nodejs.org/api/esm.html#esm_experimental_loaders) that clears
the module cache for files that are edited and the files that import them. This
allows you to re-import your application and get updated code.

```bash
node --experimental-loader hot-esm ./server.js

# Or use this shorthand:
hot ./server.js
```

```js
import * as http from 'http'

const server = http.createServer(async (request, response) => {
  const app = await import('./app.js')
  app.default(request, response)
})
server.listen(8080)
```

You'll have to find an appropriate place in your application to place an
`import()` expression. This expression needs to run often enough to not miss
updates.

State that is local to a file will be lost when that file is re-imported. To
share state between the old and new copies of a file, put that state in
`global`.

Also, any ongoing side-effects will need to be cleaned up when a new version of
a file is imported. Otherwise, for example, multiple of the same event listener
will be running. Again, this can be managed using `global` state.

Note that this only works with ECMAScript Modules and not with CommonJS modules.

Also, edits to files in `node_modules`, even if they are ECMAScript Modules are
ignored by default as attaching filesystem watchers to so many directories is
too expensive.

But, specific packages inside of `node_modules` can be watched for updates by
setting the environment variable:

```sh
HOT_INCLUDE_PACKAGES=package1,package2
```

## Development
hot-esm provides debug logging detailing which files are watched, when they get
invalidated, and when they get re-imported. Those logs can be enabled by
setting the environment variable:

```sh
DEBUG=hot-esm
```
