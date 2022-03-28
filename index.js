import process from 'process'
import path from 'path'
import {promises as fs} from 'fs'
import {URL} from 'url'
import chokidar from 'chokidar'
import makeLogger from 'debug'
import DependencyTree from './dependency-tree.js'

const log = makeLogger('hot-esm')
const dependencyTree = new DependencyTree()

const includedPackages = process.env.HOT_INCLUDE_PACKAGES
  ? process.env.HOT_INCLUDE_PACKAGES.split(',')
  : []
function isPathIgnored(filePath) {
  if (includedPackages.length === 0) {
    return filePath.includes('/node_modules')
  }

  const isWithinIncludedPackage = includedPackages.some((packageName) =>
    filePath.includes(`/node_modules/${packageName}`),
  )
  return (
    !isWithinIncludedPackage &&
    filePath.includes('/node_modules') &&
    !filePath.endsWith('/node_modules')
  )
}

let messagePort

const watcher = chokidar
  .watch([])
  .on('change', async (relativeFilePath) => {
    const filePath = path.resolve(relativeFilePath)
    const realFilePath = await fs.realpath(filePath)

    log('Changed %s', realFilePath)

    const invalidatedFiles =
      dependencyTree.invalidateFileAndDependents(realFilePath)
    log('Invalidating %s', Array.from(invalidatedFiles).join(', '))

    messagePort.postMessage(realFilePath)
  })
  .on('unlink', (relativeFilePath) => {
    const filePath = path.resolve(relativeFilePath)
    log('Deleted %s', filePath)
    dependencyTree.remove(filePath)
  })

export async function resolve(specifier, context, defaultResolve) {
  const result = await defaultResolve(specifier, context, defaultResolve)

  const parent = context.parentURL ? new URL(context.parentURL) : null
  const child = new URL(result.url)

  if (
    child.protocol === 'nodejs:' ||
    child.protocol === 'node:' ||
    isPathIgnored(child.pathname)
  ) {
    return result
  }

  const childFilePath = child.pathname
  if (!dependencyTree.has(childFilePath)) {
    log('Watching %s', childFilePath)
    dependencyTree.add(childFilePath)
    watcher.add(childFilePath)
  }

  if (parent) {
    dependencyTree.addDependent(childFilePath, parent.pathname)
  }

  return {
    ...result,
    url: `${child.href}?version=${dependencyTree.getVersion(childFilePath)}`,
  }
}

export async function load(url, context, defaultLoad) {
  const parsedUrl = new URL(url)

  if (parsedUrl.protocol !== 'node:') {
    log('Importing %s', parsedUrl.pathname)
  }

  const result = await defaultLoad(url, context, defaultLoad)

  if (result.format === 'module') {
    const source = result.source.toString()

    const newSource = source.replace(
      /if\s*\(\s*import\.meta\.hot\s*\)/,
      'if (globalThis.hotEsm.extendImportMeta(import.meta, () => import(import.meta.url)), import.meta.hot.accept)',
    )

    return {
      ...result,
      source: newSource,
    }
  }

  return result
}

export function globalPreload({port}) {
  messagePort = port

  return `
    globalThis.hotEsm = {
      extendImportMeta(importMeta, importModule) {
        const filePath = new URL(importMeta.url).pathname
        const handlers = this.handlers

        importMeta.hot = {
          accept(callback) {
            if (!handlers[filePath]) {
              handlers[filePath] = async () => {
                callback(await importModule())
              }
            }
          }
        }
      },
      handlers: {}
    }

  port.onmessage = (event) => {
    const path = event.data

    const handlers = globalThis.hotEsm.handlers
    if (handlers[path]) {
      handlers[path]()
    }
  }
  `
}
