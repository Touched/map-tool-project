/* @flow */

import fs from 'fs';
import path from 'path';
import { ParentEntity, ChildEntity } from './entity';
import Map from './map';
import Bank from './bank';
import invariant from '../util/invariant';
import chrootPath from '../util/chrootPath';
import type { EntityType, Entity } from './entity';

type ProjectData = {
  blocksets: Array<{}>,
  banks: Array<{}>,
};

type ProjectEntity = Entity<ProjectData>;

const entityClassByType: { [EntityType]: Class<ChildEntity<*>> } = {
  map: Map,
  bank: Bank,
};

export default class Project extends ParentEntity<ProjectEntity> {
  static type = 'project';

  manifestPath: string;
  projectRoot: string;
  data: ProjectEntity;
  entityDirectories: { [type: EntityType]: string };

  constructor(entityPath: string, data: ProjectEntity) {
    super(entityPath, data);
    this.projectRoot = path.dirname(entityPath);
    this.entityDirectories = {
      map: path.join(this.projectRoot, 'maps'),
      bank: path.join(this.projectRoot, 'banks'),
    };
  }

  static load(manifestPath: string): ?Project {
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return new Project(manifestPath, data);
  }

  lookupEntity({ type, id }: { type: EntityType, id: string }): ChildEntity<*> {
    const directory = this.entityDirectories[type];

    invariant(directory, `No directory configured for entity type '${type}'.`);

    const entityPath = path.join(directory, id, `${type}.json`);

    if (!fs.existsSync(entityPath)) {
      throw new Error(`Entity '${id}' of type ${type} does not exist.`);
    }

    const data = JSON.parse(fs.readFileSync(entityPath, 'utf8'));

    const EntityClass = entityClassByType[type];

    invariant(EntityClass, `No entity class exists for entity type '${type}'.`);

    return new EntityClass(entityPath, data, this);
  }

  lookupPath(inputPath: string, pathObject: { path: string }): string {
    const directory = path.dirname(inputPath);

    const resolved = path.relative(this.projectRoot, path.resolve(directory, pathObject.path));

    return chrootPath(this.projectRoot, resolved);
  }
}
