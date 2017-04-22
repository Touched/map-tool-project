/* @flow */

import path from 'path';

/**
 * Takes a path (resolvePath) and resolves it relative to a given rootPath.
 * If resolve path is '/', then the resultant path will be rootPath.
 * This functions like the linux utility chroot: i.e. you can't break out of the
 * root using special paths like '/' or '..'.
 */
export default function chrootPath(rootPath: string, resolvePath: string) {
  // Resolve the path as if it were in the root directory, producing chroot-like behaviour
  const asRoot = path.posix.relative(
    '/',
    path.posix.resolve(
      '/',

      // Enforce POSIX separators
      path.normalize(resolvePath).replace(/\\/g, '/'),
    ),
  );

  return path.join(rootPath, asRoot);
}
