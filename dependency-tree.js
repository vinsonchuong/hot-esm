export default class DependencyTree {
  #versions = new Map()
  #dependents = new Map()

  add(filePath) {
    if (!this.#versions.has(filePath)) {
      this.#versions.set(filePath, 1)
      this.#dependents.set(filePath, new Set())
    }
  }

  remove(filePath) {
    if (this.#versions.has(filePath)) {
      this.#versions.delete(filePath)
      this.#dependents.delete(filePath)
    }
  }

  has(filePath) {
    return this.#versions.has(filePath)
  }

  getVersion(filePath) {
    return this.#versions.get(filePath)
  }

  invalidate(filePath) {
    if (this.#versions.has(filePath)) {
      this.#versions.set(filePath, this.getVersion(filePath) + 1)
    }
  }

  invalidateFileAndDependents(filePath) {
    const invalidatedFiles = new Set()
    const queue = [filePath]
    while (queue.length > 0) {
      const filePath = queue.pop()
      if (!invalidatedFiles.has(filePath)) {
        this.invalidate(filePath)
        invalidatedFiles.add(filePath)
        queue.push(...this.getDependents(filePath))
      }
    }

    return invalidatedFiles
  }

  getDependents(filePath) {
    if (this.#dependents.has(filePath)) {
      return this.#dependents.get(filePath)
    }

    return new Set()
  }

  addDependent(filePath, dependentFilePath) {
    if (this.#dependents.has(filePath)) {
      this.#dependents.get(filePath).add(dependentFilePath)
    } else {
      throw new Error(
        'Adding dependency not tracked in tree. Likely a bug in the library.',
      )
    }
  }
}
