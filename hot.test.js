import test from 'ava'
import * as path from 'path'
import * as childProcess from 'child_process'
import {promisify} from 'util'
import tempy from 'tempy'
import fs from 'fs-extra'
import got from 'got'

const exec = promisify(childProcess.exec)
const sleep = promisify(setTimeout)

async function get(url) {
  const response = await got(url)
  return response.body
}

test('updating and re-importing a file', async (t) => {
  const temporaryDir = tempy.directory()
  await fs.ensureDir(temporaryDir)
  t.teardown(async () => {
    await fs.remove(temporaryDir)
  })

  async function writeFile(name, contents) {
    await fs.writeFile(path.join(temporaryDir, name), contents)
  }

  await writeFile('package.json', '{"type": "module"}')
  await exec(`yarn add file:${path.resolve()}`, {cwd: temporaryDir})
  await writeFile(
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
  await writeFile(
    'app.js',
    `
    export default function(request, response) {
      response.end('Hello World!')
    }
    `
  )

  const server = childProcess.spawn('npx', ['hot', './server.js'], {
    cwd: temporaryDir,
    detached: true
  })
  t.teardown(() => {
    process.kill(-server.pid)
  })

  await new Promise((resolve, reject) => {
    server.stdout.setEncoding('utf8')
    server.stderr.setEncoding('utf8')
    server.stdout.on('data', (data) => {
      if (data.includes('Listening')) {
        resolve()
      }
    })
    server.stderr.on('data', (data) => {
      reject(new Error(data))
    })
  })

  t.is(await get('http://localhost:10000'), 'Hello World!')

  await writeFile(
    'app.js',
    `
    export default function(request, response) {
      response.end('Other Text')
    }
    `
  )
  await sleep(300)

  t.is(await get('http://localhost:10000'), 'Other Text')

  await writeFile(
    'text.js',
    `
    export default 'Text from other file'
    `
  )
  await writeFile(
    'app.js',
    `
    import text from './text.js'
    export default function(request, response) {
      response.end(text)
    }
    `
  )
  await sleep(300)

  t.is(await get('http://localhost:10000'), 'Text from other file')
})
