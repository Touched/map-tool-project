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

if (process.argv.length !== 5) {
  console.log(`Usage: ${process.argv[0]} ${process.argv[1]} [rom] [charmap] [outdir]`);
  process.exit(1);
}

const rom = fs.readFileSync(process.argv[2]);
const outputDirectory = process.argv[4];
const charmap = fs.readFileSync(process.argv[3], 'utf8');

const mapNames = map.readMapNamesTable(rom, 0x080c0c94, 0x6D, charmap);

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
  mkdirp.sync( path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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

  fs.writeFileSync(path.join(outputDirectory, tilesPath), png.encode({
    pixels: blockset.compressed ? blockset.tiles.target.value.data : blockset.tiles.target.value,
    width: 128,
    height: 320,
    palette: [...Array(16)].map((_, i) => [i * 15, i * 15, i * 15, 255]),
  }));

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

  writeJSON(path.join(outputDirectory, blocksetPath), blocksetData);
}

function processConnection({ direction, offset, bank, map }) {
  return {
    direction,
    offset,
    map: {
      id: lookupMap(bank, map)
    },
  };
}

function decompileScript(symbol, mapPath, scriptPath, address) {
  // TODO: Actually decompile
  const filePath = path.join(mapPath, scriptPath);
  mkdirp.sync(path.dirname(filePath));
  fs.writeFileSync(filePath, '', 'utf8');

  return {
    symbol: `${symbol}Main`,
    path: scriptPath,
  };
}

function processNpcEntity(symbol, mapPath, scriptPath, npcData) {
  return Object.assign(npcData, {
    script: decompileScript(symbol, mapPath, scriptPath, npcData.script),
  });
}

function processWarpEntity(symbol, mapPath, scriptPath, { x, y, height, warp, map, bank }) {
  return {
    x,
    y,
    height,
    target: {
      warp,

      // You should be able to specify either a target map ID or just the map and bank
      // directly. 127.127 is special-cased to allow redirecting the warp target so
      // it cannot map to a specific map ID.
      map: (map === 127 && bank === 127) ? {
        map,
        bank,
      } : {
        id: lookupMap(bank, map),
      }
    }
  };
}

function processSignEntity(symbol, mapPath, scriptPath, signData) {
  const { x, y, height, type, data: { value } } = signData;
  return Object.assign({ x, y, height, type }, value, value.script ? {
    script: decompileScript(symbol, mapPath, scriptPath, value.script),
  }: {});
}

function processTriggerEntity(symbol, mapPath, scriptPath, triggerData) {
  return Object.assign(triggerData, {
    script: decompileScript(symbol, mapPath, scriptPath, triggerData.script),
  });
}

function pointerToMaybeArray(pointer) {
  return pointer.target === null ? [] : pointer.target;
}

function processEntities(symbol, mapPath, scriptPath, entityData) {
  function process(fn, key, symbolBase) {
    return pointerToMaybeArray(entityData[key]).map((entity, n) => {
      return fn(
        `${symbol}${symbolBase}${n}`,
        mapPath,
        path.join(scriptPath, symbolBase.toLowerCase(), `${n}.s`),
        entity
      );
    });
  }

  const entities = {
    npc: process(processNpcEntity, 'npcs', 'Npc'),
    warp: process(processWarpEntity, 'warps', 'Warp'),
    sign: process(processSignEntity, 'signs', 'Sign'),
    trigger: process(processTriggerEntity, 'triggers', 'Trigger'),
  };

  const result = Object.keys(entities).map(type => entities[type].map(data => ({ type, data })));

  return flatten(result);
}

function processMapScript(symbol, n, mapPath, scriptPath, { type, data: { value: data } }) {
  if (type === 'handler_env1' || type === 'handler_env2') {
    return {
      type,
      scripts: data.target.map(({ variable, data: { value: { value, script } } }, m) => ({
        variable,
        value,
        script: decompileScript(
          `${symbol}Map${n}Auto${m}`,
          mapPath,
          path.join(scriptPath, 'map', `${n}`, `${m}.s`),
          script
        ),
      })),
    };
  }

  return {
    type,
    script: decompileScript(
      `${symbol}Map${n}`,
      mapPath,
      path.join(scriptPath, 'map', `${n}.s`),
      data
    ),
  };
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

// Keep track of how many times a symbol was used
const symbolCounter = {};

// TODO: Do all of them
maps// .slice(185, 190)
  .forEach((info, i) => {
  console.log(`Processing map ${info.bank}.${info.map} (${i + 1}/${maps.length})`);
  const data = map.readMap(rom, info.address);

  const [primaryBlocksetExists, primaryBlocksetId] = lookupOrCreateBlockset(
    data.data.target.blockset1.address
  );

  const [secondaryBlocksetExists, secondaryBlocksetId] = lookupOrCreateBlockset(
    data.data.target.blockset2.address
  );

    const mapName = mapNames[data.name - 0x58];
    const mapNameSymbol = mapName.toLowerCase().replace(/\s(.)|\s^/g, s => s.toUpperCase().trim());

  const mapPath = path.join(
    outputDirectory,
    'banks',
    lookupBank(info.bank),
    lookupMap(info.bank, info.map)
  );

  if (!symbolCounter[mapNameSymbol]) {
    symbolCounter[mapNameSymbol] = 0;
  }

  const scriptSymbolPrefix = `${mapNameSymbol}${symbolCounter[mapNameSymbol] || ''}`;
  symbolCounter[mapNameSymbol]++;

  const mapData = {
    meta: {
      format: {
        type: 'map',
        version: '0.1.0',
      },
      id: lookupMap(info.bank, info.map),
      name: `Map ${info.bank}.${info.map} - ${mapName}`,
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
      scripts: pointerToMaybeArray(data.scripts).map((script, n) => processMapScript(
        scriptSymbolPrefix,
        n,
        mapPath,
        'scripts',
        script
      )),
      connections: data.connections.target ?
        pointerToMaybeArray(data.connections).connections.target.map(processConnection) : [],
      entities: processEntities(scriptSymbolPrefix, mapPath, 'scripts', data.entities.target),
    }
  };

  const mapFile = path.join(mapPath, 'map.json');

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
