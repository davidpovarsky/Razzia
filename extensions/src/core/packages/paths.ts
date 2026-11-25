/* oxlint-disable eslint/no-control-regex -- Rejecting control characters is the archive path security boundary. */
/** Archive paths are portable NFC strings, never filesystem paths or URLs. */
export function packagePath(input: string): string {
  const path = input.normalize("NFC")

  if (
    path !== input ||
    path.length > 240 ||
    /[\\\x00-\x1f\x7f:%?#<>"|*]/u.test(path) ||
    path.startsWith("/") ||
    path
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          /[. ]$/u.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part),
      )
  ) {
    throw new Error("PACKAGE_PATH")
  }

  return path
}

export const packagePathKey = (input: string) =>
  packagePath(input).toUpperCase().toLowerCase().normalize("NFC")

export function relativePackagePath(
  declaringFile: string,
  reference: string,
): string {
  packagePath(declaringFile)

  if (!reference.startsWith("./") && !reference.startsWith("../")) {
    throw new Error("PACKAGE_RELATIVE_REFERENCE_REQUIRED")
  }

  if (/[\\\x00-\x1f\x7f:%?#]/u.test(reference)) {
    throw new Error("PACKAGE_PATH")
  }

  const parts = declaringFile.split("/").slice(0, -1)
  for (const part of reference.split("/")) {
    if (part === ".") {
      continue
    }

    if (part === "..") {
      if (!parts.length) {
        throw new Error("PACKAGE_REFERENCE_ESCAPE")
      }

      parts.pop()
    } else {
      if (!part) {
        throw new Error("PACKAGE_PATH")
      }

      parts.push(part)
    }
  }

  return packagePath(parts.join("/"))
}

export function portableRelativePath(from: string, to: string): string {
  const base = packagePath(from).split("/").slice(0, -1)
  const target = packagePath(to).split("/")

  while (base.length && target.length && base[0] === target[0]) {
    base.shift()
    target.shift()
  }

  return (base.length ? "../".repeat(base.length) : "./") + target.join("/")
}
