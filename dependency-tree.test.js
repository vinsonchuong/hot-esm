import test from 'ava'
import DependencyTree from './dependency-tree.js'

test('managing a single file', (t) => {
  const tree = new DependencyTree()

  tree.add('foo.js')
  t.true(tree.has('foo.js'))
  t.is(tree.getVersion('foo.js'), 1)

  tree.invalidate('foo.js')
  t.true(tree.has('foo.js'))
  t.is(tree.getVersion('foo.js'), 2)

  tree.remove('foo.js')
  t.false(tree.has('foo.js'))
  t.falsy(tree.getVersion('foo.js'))
})

test('managing a file imported by other files', (t) => {
  const tree = new DependencyTree()
  tree.add('root.js')

  tree.add('left.js')
  tree.addDependent('left.js', 'root.js')

  tree.add('left-one.js')
  tree.addDependent('left-one.js', 'left.js')

  tree.add('left-two.js')
  tree.addDependent('left-two.js', 'left.js')

  tree.add('right.js')
  tree.addDependent('right.js', 'root.js')

  const invalidated = tree.invalidateFileAndDependents('left-one.js')
  t.deepEqual(Array.from(invalidated), ['left-one.js', 'left.js', 'root.js'])

  t.is(tree.getVersion('left-one.js'), 2)
  t.is(tree.getVersion('left.js'), 2)
  t.is(tree.getVersion('root.js'), 2)

  t.is(tree.getVersion('left-two.js'), 1)
  t.is(tree.getVersion('right.js'), 1)
})

test('supporting circular dependencies', (t) => {
  const tree = new DependencyTree()
  tree.add('one.js')

  tree.add('two.js')
  tree.addDependent('two.js', 'one.js')

  tree.add('three.js')
  tree.addDependent('three.js', 'two.js')
  tree.addDependent('one.js', 'three.js')

  const invalidated = tree.invalidateFileAndDependents('three.js')
  t.deepEqual(Array.from(invalidated), ['three.js', 'two.js', 'one.js'])

  t.is(tree.getVersion('one.js'), 2)
  t.is(tree.getVersion('two.js'), 2)
  t.is(tree.getVersion('three.js'), 2)
})
