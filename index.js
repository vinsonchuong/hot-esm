import * as url from 'url'
import watcher from '@parcel/watcher'

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

watcher.subscribe(
  './',
  (error, events) => {
    for (const event of events) {
      if (event.type === 'update') {
        const queue = [event.path]
        while (queue.length > 0) {
          const filePath = queue.pop()
          incrementVersion(filePath)
          queue.push(...getDependents(filePath))
        }
      } else if (event.type === 'delete') {
        untrackVersion(event.path)
        untrackDependents(event.path)
      }
    }
  },
  {
    ignore: ['./node_modules']
  }
)

export async function resolve(specifier, context, defaultResolve) {
  const result = defaultResolve(specifier, context, defaultResolve)

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
    url: `${child.href}?version=${getVersion(child.pathname)}`
  }
}
