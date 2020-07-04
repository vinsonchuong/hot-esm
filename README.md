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
ignored as attaching filesystem watchers to so many directories is too
expensive.
