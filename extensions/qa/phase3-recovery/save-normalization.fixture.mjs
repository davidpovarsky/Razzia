// A fresh constructor per fixture preserves the VM error identity boundary.
export function createStorageError() {
  return class StorageError extends Error {
    constructor(message, status) {
      super(message)
      this.status = status
    }
  }
}
