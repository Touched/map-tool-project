/* @flow */

export default function invariant(expression: mixed, message: string) {
  if (!expression) {
    throw new Error(message);
  }
}
