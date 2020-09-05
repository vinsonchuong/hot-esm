import test from 'ava'
import {useTemporaryDirectory, runProcess, wait, http} from 'ava-patterns'
import install from 'quick-install'

test('updating and re-importing a file', async (t) => {
  const directory = await useTemporaryDirectory(t)

  await directory.writeFile('package.json', '{"type": "module"}')

  await install(process.cwd(), directory.path)

  await directory.writeFile(
    'server.js',
    `
    import * as http from 'http'
    const server = http.createServer(async (request, response) => {
      const app = await import('./app.js')
      await app.default(request, response)
    })
    server.listen(
      10000,
      () => {
        console.log('Listening')
      }
    )
    `
  )
  await directory.writeFile(
    'app.js',
    `
    export default function(request, response) {
      response.end('Hello World!')
    }
    `
  )

  const server = runProcess(t, {
    command: ['npx', 'hot', './server.js'],
    cwd: directory.path
  })
  await server.waitForOutput('Listening')

  t.is(await http('http://localhost:10000'), 'Hello World!')

  await directory.writeFile(
    'app.js',
    `
    export default function(request, response) {
      response.end('Other Text')
    }
    `
  )
  await wait(300)

  t.is(await http('http://localhost:10000'), 'Other Text')

  await directory.writeFile(
    'text.js',
    `
    export default 'Text from other file'
    `
  )
  await directory.writeFile(
    'app.js',
    `
    import text from './text.js'
    export default function(request, response) {
      response.end(text)
    }
    `
  )
  await wait(300)

  t.is(await http('http://localhost:10000'), 'Text from other file')
})
