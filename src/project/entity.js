/* @flow */

import Project from './project';

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
  path: string;
  data: T;

  constructor(path: string, data: T) {
    this.path = path;
    this.data = data;
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
