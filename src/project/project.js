/* @flow */

import fs from 'fs';
import Ajv from 'ajv';
import entityContainerSchemaDefinition from '../schema/entity.json';
import * as entitySchemas from '../schema/entities';
import * as entityTypes from '../schema/types';

type EntityPathReference = {
  path: string,
};

type EntityMeta = {
  format: {
    type: string,
    version: string,
  },
  id: string,
  name?: string,
  description?: string,
};

type Entity<Data> = {
  meta: EntityMeta,
  data: Data,
};

type ProjectData = {
  blocksets: Array<EntityPathReference>,
  banks: Array<EntityPathReference>,
};

type UnknownEntity = Entity<{}>;
type ProjectEntity = Entity<ProjectData>;
type AnyEntity = UnknownEntity | ProjectEntity;

export default class Project {
  manifestPath: string;
  data: ProjectEntity;
  entityValidator: (type: string, entity: AnyEntity) => true;

  constructor(manifestPath: string, data: ProjectEntity) {
    this.manifestPath = manifestPath;
    this.data = data;

    const ajv = new Ajv({
      schemas: entityTypes,
    });

    const entityContainerValidate = ajv.compile(entityContainerSchemaDefinition);

    const entityValidators = Object.keys(entitySchemas).reduce((validators, type) => ({
      ...validators,
      [type]: ajv.compile(entitySchemas[type]),
    }), {});

    this.entityValidator = (type, entityData) => {
      if (!entityContainerValidate(entityData)) {
        throw new Error(entityContainerValidate.errors[0].message);
      }

      if (entityData.meta.format.type !== type) {
        throw new Error(`Entity is not of type '${type}'`);
      }

      if (!entityValidators[type](entityData.data)) {
        throw new Error(entityValidators[type].errors[0].message);
      }

      return true;
    };

    this.entityValidator('project', data);
  }

  static load(manifestPath: string): ?Project {
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return new Project(manifestPath, data);
  }
}
