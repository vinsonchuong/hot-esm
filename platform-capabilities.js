import isWsl from 'is-wsl'
import {procfs} from '@stroncium/procfs'
import isPathInside from 'is-path-inside'
import sortOn from 'sort-on'

export function supportsFileEvents(directoryPath) {
  // https://github.com/microsoft/WSL/issues/4739

  if (!isWsl) {
    return true
  }

  const mounts = sortOn(procfs.processMountinfo(), (m) => -m.mountPoint.length)
  const mount = mounts.find(
    (mount) =>
      directoryPath === mount.mountPoint ||
      isPathInside(directoryPath, mount.mountPoint),
  )
  return !mount || mount.type !== '9p'
}
