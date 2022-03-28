import process from 'process'
import test from 'ava'
import {useTemporaryDirectory, runProcess, wait, http} from 'ava-patterns'
import install from 'quick-install'

test.serial('accepting a hot update', async (t) => {
  const directory = await useTemporaryDirectory(t)

  await directory.writeFile('package.json', '{"type": "module"}')

  await install(process.cwd(), directory.path)

  await directory.writeFile(
    'server.js',
    `
    import * as http from 'http'
    import app from './app.js'

    const server = http.createServer(async (request, response) => {
      await app(request, response)
    })

    server.listen(
      10100,
      () => {
        console.log('Listening')
      }
    )
    `,
  )
  await directory.writeFile(
    'app.js',
    `
    import { text } from './text.js'

    export default function(request, response) {
      response.writeHead(200, {'Content-Type': 'text/plain'})
      response.end(text)
    }
    `,
  )
  await directory.writeFile(
    'text.js',
    `
    export let text = 'Hello World!'

    if (import.meta.hot) {
      import.meta.hot.accept((module) => {
        text = module.text
      })
    }
    `,
  )

  const server = runProcess(t, {
    command: ['npx', 'hot', './server.js'],
    cwd: directory.path,
    env: {
      DEBUG: 'hot-esm',
    },
  })
  await server.waitForOutput('Listening', 10_100)

  t.like(await http({method: 'GET', url: 'http://localhost:10100'}), {
    body: 'Hello World!',
  })

  await directory.writeFile(
    'text.js',
    `
    export let text = 'Updated World!'

    if (import.meta.hot) {
      import.meta.hot.accept((module) => {
        text = module.text
      })
    }
    `,
  )
  await wait(500)

  t.like(await http({method: 'GET', url: 'http://localhost:10100'}), {
    body: 'Updated World!',
  })

  await directory.writeFile(
    'text.js',
    `
    export let text = 'Another Update!'

    if (import.meta.hot) {
      import.meta.hot.accept((module) => {
        text = module.text
      })
    }
    `,
  )
  await wait(500)

  t.like(await http({method: 'GET', url: 'http://localhost:10100'}), {
    body: 'Another Update!',
  })
})
