/* @flow */

import { ChildEntity } from './entity';
import type { Entity } from './entity';

type MapData = {

};

type MapEntity = Entity<MapData>;

export default class Map extends ChildEntity<MapEntity> {
  static type = 'map';
}
