import test from 'ava'
import isWsl from 'is-wsl'
import {supportsFileEvents} from './platform-capabilities.js'

test('detecting support for file system change events', (t) => {
  if (isWsl) {
    t.false(supportsFileEvents('/mnt/c'))
    t.false(supportsFileEvents('/mnt/c/foo'))

    t.true(supportsFileEvents('/root'))
    t.true(supportsFileEvents('/root/foo'))
  } else {
    t.true(supportsFileEvents('/'))
    t.true(supportsFileEvents('/foo'))
  }
})
