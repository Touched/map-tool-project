/* @flow */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import chrootPath from '../chrootPath';

describe('Util: chrootPath', () => {
  it('resolves / as the provided root', () => {
    expect(chrootPath('a/b/c', '/')).to.equal('a/b/c');
  });

  it('resolves paths as if the rootPath were root', () => {
    expect(chrootPath('a', '/b/c')).to.equal('a/b/c');
  });

  it('resolves relative paths relative to the root', () => {
    expect(chrootPath('a', 'b/c')).to.equal('a/b/c');
  });

  it('does not allow getting the parent directory of the root path', () => {
    expect(chrootPath('a', '..')).to.equal('a');
    expect(chrootPath('a', '../../..')).to.equal('a');
    expect(chrootPath('a', 'b/../../..')).to.equal('a');
    expect(chrootPath('a', '../../../b')).to.equal('a/b');
  });
});
