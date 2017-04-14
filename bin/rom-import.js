#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const uuid = require('uuid/v4');
const png = require('@Touched/indexed-png');
const map = require('../lib/rom/map.js');

const idLookup = {
  banks: {},
  maps: {},
  blocksets: {},
};

function lookupMap(bank, map) {
  if (!idLookup.maps[bank] || !idLookup.maps[bank][map]) {
    throw new Error(`Invalid map ${bank}.${map}`);
  }

  return idLookup.maps[bank][map];
}

function lookupBank(bank) {
  if (!idLookup.banks[bank]) {
    throw new Error(`Invalid bank ${bank}`);
  }

  return idLookup.banks[bank];
}

function lookupOrCreateBlockset(address) {
  if (!idLookup.blocksets[address]) {
    const id = uuid();
    idLookup.blocksets[address] = id;
    return [false, id];
  }

  return [true, idLookup.blocksets[address]];
}

if (process.argv.length !== 4) {
  console.log(`Usage: ${process.argv[0]} ${process.argv[1]} [rom] [outdir]`);
  process.exit(1);
}

const rom = fs.readFileSync(process.argv[2]);
const outputDirectory = process.argv[3];

const romHeader = rom.slice(0xac, 0xac + 4).toString('ascii');
const romVersion = rom[0xbc];
const description = `Imported from ${romHeader} version 1.${romVersion}`;

function simplifyObjectArray(array) {
  return array.reduce((result, element) => {
    Object.keys(element).forEach((key) => {
      if (!result.hasOwnProperty(key)) {
        result[key] = [];
      }

      result[key].push(element[key]);

      return result;
    });

    return result;
  }, {});
}

function flatten(array) {
  return [].concat(...array);
}

function writeJSON(filePath, data) {
  const p = path.join(outputDirectory, filePath);
  const dir = path.dirname(p);

  mkdirp.sync(dir);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function processBlockset(address, blockset) {
  const [_, id] = lookupOrCreateBlockset(address);
  const blocksetPath = path.join('blocksets', id.toString(16), 'blockset.json');
  const tilesPath = path.join('blocksets', id.toString(16), 'tiles.png');
  const o = path.join(outputDirectory, blocksetPath);

  mkdirp.sync(path.dirname(o));

  const blocks = blockset.blocks.target.map((tiles, i) => {
    return Object.assign({ tiles }, blockset.behaviors.target[i]);
  });

  try {
    fs.writeFileSync(path.join(outputDirectory, tilesPath), png.encode({
      pixels: blockset.tiles.target.data,
      width: 128,
      height: 320,
      palette: [...Array(16)].map((_, i) => [i * 15, i * 15, i * 15, 255]),
    }));
  } catch (e) {
    // FIXME: Handle uncompressed tilesets
  }

  const blocksetData = {
    meta: {
      format: {
        type: 'blockset',
        version: '0.1.0',
      },
      id,
      name: `Blockset id.toString(16)`,
      description,
    },
    data: {
      primary: !blockset.secondary,
      palette: blockset.palette.target,
      blocks,
      // TODO: Export callback function
      // function: {
      //   symbol: 'animation',
      // },
    }
  };

  writeJSON(blocksetPath, blocksetData);
}

function processConnection({ direction, offset, bank, map }) {
  return {
    direction,
    offset,
    target: {
      id: lookupMap(bank, map)
    },
  };
}

function processNpcEntity(npcData) {
  return npcData;
}

function processWarpEntity(warpData) {
  return warpData;
}

function processSignEntity(signData) {
  const { x, y, height, type, data: { value } } = signData;
  return Object.assign({ x, y, height, type }, value);
}

function processTriggerEntity(triggerData) {
  return triggerData;
}

function pointerToMaybeArray(pointer) {
  return pointer.target === null ? [] : pointer.target;
}

function processEntities(entityData) {
  const entities = {
    npc: pointerToMaybeArray(entityData.npcs).map(processNpcEntity),
    warp: pointerToMaybeArray(entityData.warps).map(processWarpEntity),
    sign: pointerToMaybeArray(entityData.signs).map(processSignEntity),
    trigger: pointerToMaybeArray(entityData.triggers).map(processTriggerEntity),
  };

  const result = Object.keys(entities).map(type => entities[type].map(data => ({ type, data })));

  return flatten(result);
}

if (fs.existsSync(outputDirectory)) {
  console.log('Output directory already exists');
  process.exit(0);
}

/* TODO: From INI */
const bankSizes = [
  5, 123, 60, 66, 4, 6,
  8, 10, 6, 8, 20, 10,
  8, 2, 10, 4, 2, 2,
  2, 1, 1, 2, 2, 3,
  2, 3, 2, 1, 1, 1,
  1, 7, 5, 5, 8, 8,
  5, 5, 1, 1, 1, 2, 1,
];

const mapBankTableAddress = 0x0805524C;
const mapBankTable = map.readMapsTable(rom, mapBankTableAddress, bankSizes);

// Create a flat array of maps by bank number
const maps = flatten(mapBankTable.map((bank, n) => {
  return bank.map((address, m) => ({
    map: m,
    bank: n,
    address,
  }));
}));

// Create an ID for every map
maps.forEach(({ map, bank }) => {
  if (idLookup.maps[bank] === undefined) {
    idLookup.maps[bank] = {};
    idLookup.banks[bank] = uuid();
  }

  idLookup.maps[bank][map] = uuid();
});

// TODO: Do all of them
maps.slice(185, 190).forEach((info, i) => {
  console.log(`Processing map ${info.bank}.${info.map} (${i + 1}/${maps.length})`);
  const data = map.readMap(rom, info.address);

  const [primaryBlocksetExists, primaryBlocksetId] = lookupOrCreateBlockset(
    data.data.target.blockset1.address
  );

  const [secondaryBlocksetExists, secondaryBlocksetId] = lookupOrCreateBlockset(
    data.data.target.blockset2.address
  );

  const mapData = {
    meta: {
      format: {
        type: 'map',
        version: '0.1.0',
      },
      id: lookupMap(info.bank, info.map),
      name: `Map ${info.map}`,
      description,
    },
    data: {
      border: {
        width: data.data.target.bb_width,
        height: data.data.target.bb_height,
        data: simplifyObjectArray(flatten(data.data.target.borderblock.target)),
      },
      map: {
        width: data.data.target.width,
        height: data.data.target.height,
        data: simplifyObjectArray(flatten(data.data.target.data.target)),
      },
      blocksets: {
        primary: {
          id: primaryBlocksetId
        },
        secondary: {
          id: secondaryBlocksetId,
        },
      },
      scripts: null,
      connections: data.connections.target ?
        data.connections.target.connections.target.map(processConnection) : [],
      entities: processEntities(data.entities.target),
    }
  };

  const mapFile = path.join(
    'banks',
    lookupBank(info.bank),
    lookupMap(info.bank, info.map),
    'map.json'
  );

  writeJSON(mapFile, mapData);

  if (!primaryBlocksetExists) {
    console.log('Processing primary blockset');
    processBlockset(data.data.target.blockset1.address, data.data.target.blockset1.target);
  }

  if (!secondaryBlocksetExists) {
    console.log('Processing secondary blockset');
    processBlockset(data.data.target.blockset2.address, data.data.target.blockset2.target);
  }
});
