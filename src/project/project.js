/* @flow */

import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import ajvKeywords from 'ajv-keywords';
import R from 'ramda';
import entityContainerSchemaDefinition from '../schema/entity.json';
import * as entitySchemas from '../schema/entities';
import * as entityTypes from '../schema/types';
import invariant from '../util/invariant';

type EntityPathReference = {
  path: string,
};

type EntityMeta<Type: string> = {
  format: {
    type: Type,
    version: string,
  },
  id: string,
  name?: string,
  description?: string,
};

type Entity<Type: string, Data> = {
  meta: EntityMeta<Type>,
  data: Data,
};

type ProjectData = {
  blocksets: Array<EntityPathReference>,
  banks: Array<EntityPathReference>,
};

type MapData = {

};

type BankData = {
  maps: Array<EntityPathReference>,
};

type EntityDataTypes = {
  project: ProjectData,
  bank: BankData,
  map: MapData,
};

type CollectedEntity = {
  type: $Enum<EntityDataTypes>,
  path: string,
  entity: AnyEntity,
};

// Hopefully when https://github.com/facebook/flow/pull/2952 is merged this can be made generic
type ProjectEntity = Entity<'project', $PropertyType<EntityDataTypes, 'project'>>;
type MapEntity = Entity<'map', $PropertyType<EntityDataTypes, 'map'>>;
type BankEntity = Entity<'bank', $PropertyType<EntityDataTypes, 'bank'>>;

type AnyEntity = ProjectEntity | BankEntity | MapEntity;

export default class Project {
  manifestPath: string;
  projectRoot: string;
  data: ProjectEntity;
  entityValidator: (type: $Enum<EntityDataTypes>, entity: AnyEntity) => true;
  entities: { [string]: CollectedEntity };

  constructor(manifestPath: string, data: ProjectEntity) {
    this.manifestPath = manifestPath;
    this.data = data;
    this.projectRoot = path.dirname(manifestPath);

    const ajv = new Ajv({
      $data: true,
      schemas: entityTypes,
    });

    ajvKeywords(ajv);

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
        console.log(entityValidators[type].errors);
        throw new Error(entityValidators[type].errors[0].message);
      }

      return true;
    };

    this.entityValidator('project', data);

    const { entityValidator, projectRoot } = this;

    // Build lists of all the entity IDs and their types
    function loadEntity<T: AnyEntity>(type: $Enum<EntityDataTypes>, entityPath: string): T {
      // TODO: Replace path.join with a resolve relative to project root
      // (allow both absolute paths and relative paths with '/' being the project root)
      const absolutePath = path.join(projectRoot, entityPath);

      const json = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
      try {
        entityValidator(type, json);
      } catch (e) {
        throw new Error(`${absolutePath}: ${e.message}`);
      }
      return json;
    }

    /**
     * Collect all the entities that the bank manifest defines (maps)
     */
    function collectBankEntities(paths: Array<string>): Array<CollectedEntity> {
      const bankEntities = paths.map(p => ({
        path: p,
        type: 'bank',
        entity: loadEntity('bank', p),
      }));

      const mapEntities = R.flatten(bankEntities.map(({ path: bankPath, entity: bank }) =>
        bank.data.maps.map((mapReference) => {
          const mapPath = path.join(path.dirname(bankPath), mapReference.path);

          return {
            path: mapPath,
            type: 'map',
            entity: loadEntity('map', mapPath),
          };
        }),
      ));

      return [
        ...bankEntities,
        ...mapEntities,
      ];
    }

    const collectedEntities = [
      ...collectBankEntities(data.data.banks.map(({ path: p }) => p)),
    ];

    // TODO: Ensure there are no duplicated IDs
    this.entities = R.indexBy(R.path(['entity', 'meta', 'id']), collectedEntities);
  }

  static load(manifestPath: string): ?Project {
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return new Project(manifestPath, data);
  }

  lookupEntity(type: $Enum<EntityDataTypes>, id: string): AnyEntity {
    invariant(this.entities[id], `Entity '${id}' does not exist.`);

    const { entity, type: actualType } = this.entities[id];

    invariant(actualType === type, `Entity '${id}' is not of type '${type}'.`);

    return entity;
  }
}
