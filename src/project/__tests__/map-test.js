/* @flow */

import { describe, it } from 'mocha';
import testEntityFieldValidation from './helpers';
import Map from '../map';

describe('Map', () => {
  describe('constructor', () => {
    const baseData = {
      meta: {
        format: {
          type: 'map',
          version: '1.0.0',
        },
        id: 'id',
      },
      data: {
        connections: [],
        entities: [],
        scripts: [],
        linked: {
          id: 'other-map',
        },
      },
    };

    it('throws an error if it is not a map entity', () => {
      testEntityFieldValidation(Map, baseData, 'meta.format.type', {
        valid: ['map'],
        invalid: ['not-a-map'],
      });
    });
  });
});
