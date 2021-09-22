import path from 'path'
import * as url from 'url'
import chokidar from 'chokidar'

const versions = new Map()
function trackVersion(filePath) {
  if (!versions.has(filePath)) {
    versions.set(filePath, 1)
  }
}

function untrackVersion(filePath) {
  versions.delete(filePath)
}

function getVersion(filePath) {
  return versions.get(filePath)
}

function incrementVersion(filePath) {
  if (versions.has(filePath)) {
    versions.set(filePath, versions.get(filePath) + 1)
  }
}

const dependents = new Map()
function getDependents(filePath) {
  if (dependents.has(filePath)) {
    return dependents.get(filePath)
  }

  return new Set()
}

function addDependent(filePath, dependentFilePath) {
  if (dependents.has(filePath)) {
    dependents.get(filePath).add(dependentFilePath)
  } else {
    dependents.set(filePath, new Set([dependentFilePath]))
  }
}

function untrackDependents(filePath) {
  dependents.delete(filePath)
}

chokidar
  .watch('./', {
    ignored: '**/node_modules/**',
  })
  .on('change', (relativeFilePath) => {
    const filePath = path.resolve(relativeFilePath)
    const queue = [filePath]
    while (queue.length > 0) {
      const filePath = queue.pop()
      incrementVersion(filePath)
      queue.push(...getDependents(filePath))
    }
  })
  .on('unlink', (relativeFilePath) => {
    const filePath = path.resolve(relativeFilePath)
    untrackVersion(filePath)
    untrackDependents(filePath)
  })

export async function resolve(specifier, context, defaultResolve) {
  const result = await defaultResolve(specifier, context, defaultResolve)

  const parent = context.parentURL ? new url.URL(context.parentURL) : null
  const child = new url.URL(result.url)

  if (
    child.protocol === 'nodejs:' ||
    child.protocol === 'node:' ||
    child.pathname.includes('/node_modules/')
  ) {
    return result
  }

  trackVersion(child.pathname)
  if (parent) {
    addDependent(child.pathname, parent.pathname)
  }

  return {
    url: `${child.href}?version=${getVersion(child.pathname)}`,
  }
}
