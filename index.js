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
  if (filePath.includes('/.yarn/')) {
    return true
  }

  if (filePath.includes('/node_modules/')) {
    return !includedPackages.some((packageName) =>
      filePath.includes(`/node_modules/${packageName}`),
    )
  }

  return false
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

export async function resolve(specifier, context, nextResolve) {
  const parentUrl = context.parentURL && new URL(context.parentURL)
  if (parentUrl?.searchParams.has('hot-esm')) {
    parentUrl.searchParams.delete('hot-esm')
    context = {...context, parentURL: parentUrl.href}
  }

  const result = await nextResolve(specifier, context)

  const resultUrl = new URL(result.url)
  const resultPath = resultUrl.pathname
  if (resultUrl.protocol !== 'file:' || isPathIgnored(resultPath)) {
    return result
  }

  if (!dependencyTree.has(resultPath)) {
    log('Watching %s', resultPath)
    dependencyTree.add(resultPath)
    watcher.add(resultPath)
  }

  const parentPath = parentUrl?.pathname
  if (parentPath) {
    dependencyTree.addDependent(resultPath, parentPath)
  }

  resultUrl.searchParams.set('hot-esm', dependencyTree.getVersion(resultPath))
  return {...result, url: resultUrl.href}
}

export function load(url, context, nextLoad) {
  const parsedUrl = new URL(url)
  if (parsedUrl.searchParams.has('hot-esm')) {
    parsedUrl.searchParams.delete('hot-esm')
    url = parsedUrl.href
  }

  if (parsedUrl.protocol === 'file:') {
    log('Importing %s', parsedUrl.pathname)
  }

  return nextLoad(url, context)
}
