/* @flow */

import path from 'path';
import { describe, it } from 'mocha';
import { expect } from 'chai';
import Project from '../project';
import invariant from '../../util/invariant';
import testEntityFieldValidation from './helpers';

describe('Project', () => {
  const manifestPath = path.join(__dirname, '/fixtures/bpre0-project/project.json');

  describe('load', () => {
    it('returns a project object given a valid manifest', () => {
      const project = Project.load(manifestPath);

      invariant(project);
      expect(project).to.be.an.instanceOf(Project);
      expect(project.path).to.equal(manifestPath);
      expect(project.data.meta.name).to.equal('Project');
    });

    it('returns null if no project could be found', () => {
      expect(Project.load('fixtures/no-project-here/project.json')).to.be.null();
    });
  });

  describe('constructor', () => {
    it('throws an error if the data is not a valid entity', () => {
      // $FlowFixMe
      expect(() => new Project('', {})).to.throw('should have required property');
    });

    const baseData = {
      meta: {
        format: {
          type: 'project',
          version: '1.0.0',
        },
        id: 'id',
      },
      data: {
        banks: [],
      },
    };

    it('throws an error if it is not a project entity', () => {
      testEntityFieldValidation(Project, baseData, 'meta.format.type', {
        valid: ['project'],
        invalid: ['not-a-project'],
      });
    });

    it('expects valid ids', () => {
      testEntityFieldValidation(Project, baseData, 'meta.id', {
        valid: ['valid-id', 'id', 'another-valid-id', 'valid123'],
        invalid: ['Invalid', 'not-Valid', 'not_valid', '-invalid', '0invalid'],
      });
    });

    it('expects version 1.0.0', () => {
      testEntityFieldValidation(Project, baseData, 'meta.format.version', {
        valid: ['1.0.0'],
        invalid: ['0.0.1', '7.5.9', '1.0.2', '0.9.9'],
      });
    });

    it('expects data to have values', () => {
      testEntityFieldValidation(Project, baseData, 'data', {
        valid: [baseData.data],
        invalid: [{}],
      });
    });
  });

  describe('lookupEntity', () => {
    it('looks up the entity in the filesystem', () => {
      const project = Project.load(manifestPath);
      invariant(project);

      expect(project.lookupEntity('map', 'map-3-0').data.meta.id).to.equal('map-3-0');
      expect(project.lookupEntity('bank', 'bank-3').data.meta.id).to.equal('bank-3');
    });
  });
});
