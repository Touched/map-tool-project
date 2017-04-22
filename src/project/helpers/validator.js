/* @flow */

import Ajv from 'ajv';
import ajvKeywords from 'ajv-keywords';
import entityContainerSchemaDefinition from '../../schema/entity.json';
import * as entitySchemas from '../../schema/entities';
import * as entityTypes from '../../schema/types';
import type { EntityType, Entity } from '../entity';

const ajv = new Ajv({
  $data: true,
  schemas: entityTypes,
});

ajvKeywords(ajv);

const entityContainerValidate = ajv.compile(entityContainerSchemaDefinition);

const entityDataValidators = Object.keys(entitySchemas).reduce((validators, type) => ({
  ...validators,
  [type]: ajv.compile(entitySchemas[type]),
}), {});

export default function validateEntity(type: EntityType, entityData: Entity<Object>) {
  if (!entityContainerValidate(entityData)) {
    throw new Error(entityContainerValidate.errors[0].message);
  }

  if (entityData.meta.format.type !== type) {
    throw new Error(`Entity is not of type '${type}'`);
  }

  if (!entityDataValidators[type](entityData.data)) {
    throw new Error(entityDataValidators[type].errors[0].message);
  }

  return true;
}
