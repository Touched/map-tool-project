/* @flow */

import { ChildEntity } from './entity';
import type { Entity } from './entity';

type BankData = {

};

type BankEntity = Entity<BankData>;

export default class Bank extends ChildEntity<BankEntity> {
  static type = 'bank';
}
