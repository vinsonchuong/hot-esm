import process from 'process'
import path from 'path'
import {promises as fs} from 'fs'
import {URL} from 'url'
import chokidar from 'chokidar'
import makeLogger from 'debug'
import DependencyTree from './dependency-tree.js'
import {supportsFileEvents} from './platform-capabilities.js'

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

const watcher = chokidar
  .watch([], {
    usePolling: !supportsFileEvents(path.resolve()),
  })
  .on('change', async (relativeFilePath) => {
    const filePath = path.resolve(relativeFilePath)
    const realFilePath = await fs.realpath(filePath)

    log('Changed %s', realFilePath)

    const invalidatedFiles =
      dependencyTree.invalidateFileAndDependents(realFilePath)
    log('Invalidating %s', Array.from(invalidatedFiles).join(', '))
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

export function load(url, context, defaultLoad) {
  const parsedUrl = new URL(url)

  if (parsedUrl.protocol !== 'node:') {
    log('Importing %s', parsedUrl.pathname)
  }

  return defaultLoad(url, context, defaultLoad)
}
