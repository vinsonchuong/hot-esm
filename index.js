import process from 'process'
import path from 'path'
import {promises as fs} from 'fs'
import * as url from 'url'
import chokidar from 'chokidar'

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
    ignored: (relativeFilePath) => {
      const filePath = path.resolve(relativeFilePath)
      return isPathIgnored(filePath)
    },
  })
  .on('change', async (relativeFilePath) => {
    const filePath = path.resolve(relativeFilePath)
    const realFilePath = await fs.realpath(filePath)

    const queue = [realFilePath]
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
    isPathIgnored(child.pathname)
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
