/* @flow */

import type Project from './project';
import validateEntity from './helpers/validator';
import invariant from '../util/invariant';

export type EntityMeta = {
  format: {
    type: string,
    version: string,
  },
  id: string,
  name?: string,
  description?: string,
};

export type EntityType = 'project' | 'bank' | 'map';

export type Entity<Data> = {
  meta: EntityMeta,
  data: Data,
};

export class AbstractEntity<T> {
  static type: EntityType;
  path: string;
  data: T;

  constructor(path: string, data: T) {
    this.path = path;
    this.data = data;

    invariant(
      this.constructor.type,
      `Entity '${this.constructor.name}' does not have a static 'type' property`,
    );

    validateEntity(this.constructor.type, data);
  }
}

export class ParentEntity<T> extends AbstractEntity<T> {}

export class ChildEntity<T> extends AbstractEntity<T> {
  project: Project;

  constructor(entityPath: string, data: T, project: Project) {
    super(entityPath, data);
    this.project = project;
  }
}
