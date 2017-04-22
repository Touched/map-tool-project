
/* @flow */
import util from 'util';
import immutable from 'object-path-immutable';
import invariant from '../../util/invariant';

export default function testEntityFieldValidation(
  Type: Function,
  base: Object, // eslint-disable-line flowtype/no-weak-types
  objectPath: string,
  { valid, invalid }: { valid: Array<mixed>, invalid: Array<mixed> },
) {
  valid.forEach((value) => {
    const testValue = immutable.set(base, objectPath, value);
    try {
      return new Type('', testValue);
    } catch (e) {
      throw new Error(
        `Expected valid value '${util.inspect(value)}' at '${objectPath}' to not throw an error`
      + ` but it failed with: '${e.message}'.`,
      );
    }
  });

  invalid.forEach((value) => {
    const testValue = immutable.set(base, objectPath, value);

    try {
      const project = new Type('', testValue);
      invariant(project);
    } catch (e) {
      return;
    }

    throw new Error(
      `Expected invalid value '${util.inspect(value)}' at '${objectPath}' to throw an error but it `
    + 'validated.',
    );
  });
}
