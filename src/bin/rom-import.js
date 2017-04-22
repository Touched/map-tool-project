#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import Promise from 'bluebird';
import png from '@touched/indexed-png';
import * as map from '../rom/map';
import TaskRunner from '../taskRunner';
import invariant from '../util/invariant';

const fsPromise = Promise.promisifyAll(fs);
const mkdirpPromise = Promise.promisify(mkdirp);

function objectValuesOrderedByKey(obj) {
   return Array.from(Object.entries(obj)).sort(([a], [b]) => {
     return a - b;
   }).map(pair => pair[1]);
}

// Keep track of how many times a symbol was used
const symbolCounter = {};

const idLookup = {
  banks: {},
  maps: {},
  blocksets: {},
  mapDataHeaders: {},
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

let blocksetId = 0;
function lookupOrCreateBlockset(address) {
  if (!idLookup.blocksets[address]) {
    const id = `blockset-${blocksetId++}`;
    idLookup.blocksets[address] = id;
    return [false, id];
  }

  return [true, idLookup.blocksets[address]];
}

function lookupLinkedMap(dataHeaderId, id) {
  if (!idLookup.mapDataHeaders[dataHeaderId]) {
    idLookup.mapDataHeaders[dataHeaderId] = id;
    return null;
  }

  return idLookup.mapDataHeaders[dataHeaderId];
}

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

async function writeJSON(filePath, data) {
  await mkdirpPromise(path.dirname(filePath));
  return await fsPromise.writeFileAsync(filePath, JSON.stringify(data, null, 2));
}

async function processBlockset(meta, address, blockset) {
  const [_, id] = lookupOrCreateBlockset(address);
  const blocksetPath = path.join('blocksets', id.toString(16), 'blockset.json');
  const tilesPath = path.join('blocksets', id.toString(16), 'tiles.png');
  const o = path.join(meta.outputDirectory, blocksetPath);

  await mkdirpPromise(path.dirname(o));

  const blocks = blockset.blocks.target.map((tiles, i) => {
    return Object.assign({ tiles }, blockset.behaviors.target[i]);
  });

  await fsPromise.writeFileAsync(path.join(meta.outputDirectory, tilesPath), png.encode({
    pixels: blockset.compressed ? blockset.tiles.target.value.data : blockset.tiles.target.value,
    width: 128,
    height: 320,
    palette: [...Array(16)].map((_, i) => [i * 15, i * 15, i * 15, 255]),
  }));

  const blocksetData = {
    meta: {
      format: {
        type: 'blockset',
        version: '1.0.0',
      },
      id,
      name: `Blockset ${id.toString(16)}`,
      description: meta.description,
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

  return await writeJSON(path.join(meta.outputDirectory, blocksetPath), blocksetData);
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

async function decompileScript(symbol, mapPath, scriptPath, address) {
  // TODO: Actually decompile
  const filePath = path.join(mapPath, scriptPath);
  await mkdirpPromise(path.dirname(filePath));
  await fsPromise.writeFileAsync(filePath, '', 'utf8');

  return {
    symbol: `${symbol}Main`,
    path: scriptPath,
  };
}

async function processObjectEntity(symbol, mapPath, scriptPath, objectData) {
  return {
    ...objectData,
    script: await decompileScript(symbol, mapPath, scriptPath, objectData.script),
  };
}

async function processWarpEntity(symbol, mapPath, scriptPath, { x, y, height, warp, map, bank }) {
  return {
    x,
    y,
    height,
    target: {
      warp: `warp-${warp}`,

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

async function processInteractableEntity(symbol, mapPath, scriptPath, signData) {
  const { x, y, height, type, data: { value } } = signData;

  let typeSpecificData = {};

  if (type.match(/^script.*$/)) {
    const direction = /^script_?(.*)$/.exec(type);

    typeSpecificData = {
      type: 'script',
      script: await decompileScript(symbol, mapPath, scriptPath, value.script),
    };

    if (direction[1] !== '') {
      typeSpecificData.direction = direction[1];
    }
  } else if (type.match(/^hidden_item.*$/)) {
    invariant(type === 'hidden_item2', 'Unexpected hidden item type');

    typeSpecificData = {
      item: value.item,

      // Item flag 0x3E8 + id in FRLG and 0x1F4 + id in Emerald
      hiddenItemId: value.id,

      // FRLG Only
      quantity: value.data.amount || 1,

      // The hidden item types all behave the same
      type: 'hiddenItem',
    };

    // FRLG Only
    // http://bulbapedia.bulbagarden.net/wiki/Dowsing_Machine#Generation_III
    if (value.data.itemfinder) {
      typeSpecificData['itemfinderOnly'] = true;
    }
  } else if (type.match(/^secret_base.*$/)) {
    // RSE Only
    typeSpecificData = {
      type: 'secretBase',
      secretBaseId: value.id,
    };
  } else {
    throw new Error(`Invalid sign type '${type}'`);
  }

  return {
    x,
    y,
    height,
    type,
    ...typeSpecificData,
  };
}

async function processTriggerEntity(symbol, mapPath, scriptPath, triggerData) {
  return Object.assign(triggerData, {
    script: await decompileScript(symbol, mapPath, scriptPath, triggerData.script),
  });
}

function pointerToMaybeArray(pointer) {
  return pointer.target === null ? [] : pointer.target;
}

async function processEntities(symbol, mapPath, scriptPath, entityData) {
  function process(fn, key, symbolBase) {
    return Promise.all(pointerToMaybeArray(entityData[key]).map((entity, n) => {
      return fn(
        `${symbol}${symbolBase}${n}`,
        mapPath,
        path.join(scriptPath, symbolBase.toLowerCase(), `${n}.s`),
        entity
      );
    }));
  }

  const entities = {
    warp: await process(processWarpEntity, 'warps', 'Warp'),

    // AdvanceMap (and therefore the other editors) calls this a sign, but they
    // don't have to be signposts (they can be hidden items, secret bases, etc.).
    // In fact, the only thing that they have in common is you can press A on them
    // to activate them (actually, for the itemfinder only items you can't even do that,
    // but I digress). Therefore 'iteractable' is a better name.
    interactable: await process(processInteractableEntity, 'interactables', 'Interactable'),

    trigger: await process(processTriggerEntity, 'triggers', 'Trigger'),

    // Again, AdvanceMap called these NPCs, but they actuall include far more things
    // than just people: vehicles, berry trees, items (visible). Therefore "object"
    // is a better name as it is closer to the GBA terminology (i.e. hardware sprites
    // or objects)
    object: await process(processObjectEntity, 'objects', 'Object'),
  };

  const result = Object.keys(entities).map(type => entities[type].map(
    ({ x, y, height: z, ...data }, n) => {
      const id = data.id || n;
      delete data.id;

      return {
        type,
        x,
        y,
        z,
        data,
        id: `${type}-${id}`,
      };
    },
  ));

  return flatten(result);
}

async function processMapScript(symbol, n, mapPath, scriptPath, { type, data: { value: data } }) {
  if (type === 'handler_env1' || type === 'handler_env2') {
    return {
      type,
      scripts: await Promise.all(
        data.target.map(async ({ variable, data: { value: { value, script } } }, m) => ({
          variable,
          value,
          script: await decompileScript(
            `${symbol}Map${n}Auto${m}`,
            mapPath,
            path.join(scriptPath, 'map', `${n}`, `${m}.s`),
            script
          ),
      }))),
    };
  }

  return {
    type,
    script: await decompileScript(
      `${symbol}Map${n}`,
      mapPath,
      path.join(scriptPath, 'map', `${n}.s`),
      data
    ),
  };
}

async function dumpMap(meta, info) {
  const data = map.readMap(meta.rom, info.address);

  const [primaryBlocksetExists, primaryBlocksetId] = lookupOrCreateBlockset(
    data.data.target.blockset1.address
  );

  const [secondaryBlocksetExists, secondaryBlocksetId] = lookupOrCreateBlockset(
    data.data.target.blockset2.address
  );

  const mapName = meta.mapNames[data.name - 0x58];
  const mapNameSymbol = mapName.toLowerCase().replace(/\s(.)|\s^/g, s => s.toUpperCase().trim());

  const mapPath = path.join(
    meta.outputDirectory,
    'banks',
    lookupBank(info.bank),
    lookupMap(info.bank, info.map)
  );

  if (!symbolCounter[mapNameSymbol]) {
    symbolCounter[mapNameSymbol] = 0;
  }

  const scriptSymbolPrefix = `${mapNameSymbol}${symbolCounter[mapNameSymbol] || ''}`;
  symbolCounter[mapNameSymbol]++;

  invariant(
    meta.mapDataHeaders[data.mapindex - 1].address === data.data.address,
    'Map footers do not match',
  );

  const mapId = lookupMap(info.bank, info.map);
  const linkedId = lookupLinkedMap(data.mapindex, mapId);

  const mapBlockData = linkedId === null ? {
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
  } : {
    linked: {
      id: linkedId
    },
  };

  const mapData = {
    meta: {
      format: {
        type: 'map',
        version: '1.0.0',
      },
      id: mapId,
      name: `Map ${info.bank}.${info.map} - ${mapName}`,
      description: meta.description,
    },
    data: {
      ...mapBlockData,
      scripts: await Promise.all(
        pointerToMaybeArray(data.scripts).map((script, n) => processMapScript(
          scriptSymbolPrefix,
          n,
          mapPath,
          'scripts',
          script
        )),
      ),
      connections: data.connections.target ? data.connections.target.connections.target.map(
        processConnection,
      ) : [],
      entities: await processEntities(scriptSymbolPrefix, mapPath, 'scripts', data.entities.target),
    },
  };

  const mapFile = path.join(mapPath, 'map.json');

  const bankId = lookupBank(info.bank);
  const bankFile = path.join(meta.outputDirectory, 'banks', bankId, 'bank.json');

  if (!fs.existsSync(bankFile)) {
    if (!idLookup.maps[info.bank]) {
      throw new Error(`Invalid bank ${info.bank}`);
    }

    // Get a list of map IDs sorted by their index in the bank
    const mapsForBank = objectValuesOrderedByKey(idLookup.maps[info.bank]);

    const bankData = {
      meta: {
        format: {
          type: 'bank',
          version: '1.0.0',
        },
        id: bankId,
        name: `Bank ${info.bank}`,
        description: meta.description,
      },
      data: {
        maps: mapsForBank.map(id => ({
          path: `${id}/map.json`,
        })),
      },
    };

    await writeJSON(bankFile, bankData);
  }

  await writeJSON(mapFile, mapData);

  if (!primaryBlocksetExists) {
    await processBlockset(
      meta,
      data.data.target.blockset1.address,
      data.data.target.blockset1.target,
    );
  }

  if (!secondaryBlocksetExists) {
    await processBlockset(
      meta,
      data.data.target.blockset2.address,
      data.data.target.blockset2.target,
    );
  }
}

async function buildProjectManifest({ description, outputDirectory }) {
  const banks = objectValuesOrderedByKey(idLookup.banks);
  const blocksets = objectValuesOrderedByKey(idLookup.blocksets);

  const projectData = {
    meta: {
      format: {
        type: 'project',
        version: '1.0.0',
      },
      id: 'project',
      name: 'Project',
      description,
    },
    data: {
      blocksets: blocksets.map(blocksetId => ({
        path: `blocksets/${blocksetId}/blockset.json`,
      })),
      banks: banks.map(bankId => ({
        path: `banks/${bankId}/bank.json`,
      })),
    },
  };

  const projectFile = path.join(outputDirectory, 'project.json');

  await writeJSON(projectFile, projectData);
}

// MAIN:
function main(argv) {
  if (argv.length !== 5) {
    console.log(`Usage: ${process.argv[0]} ${process.argv[1]} [rom] [charmap] [outdir]`);
    process.exit(1);
  }

  const outputDirectory = argv[4];

  if (fs.existsSync(outputDirectory)) {
    console.log('Output directory already exists');
    process.exit(0);
  }

  const rom = fs.readFileSync(argv[2]);
  const charmap = fs.readFileSync(argv[3], 'utf8');

  const mapNames = map.readMapNamesTable(rom, 0x080c0c94, 0x6D, charmap);

  const romHeader = rom.slice(0xac, 0xac + 4).toString('ascii');
  const romVersion = rom[0xbc];
  const description = `Imported from ${romHeader} version 1.${romVersion}`;

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
      idLookup.banks[bank] = `bank-${bank}`;
    }

    idLookup.maps[bank][map] = `map-${bank}-${map}`;
  });

  const mapDataHeaders = map.readMapsDataHeadersTable(rom, 0x08055194, 384);

  const meta = {
    mapDataHeaders,
    mapNames,
    description,
    outputDirectory,
    rom,
  };

  const dumpMapsTask = {
    name: 'Dumping maps',
    subtasks: maps.map(info => ({
      name: `Map ${info.bank}.${info.map}`,
      thunk: () => dumpMap(meta, info),
    })),
  };

  const buildProjectManifestTask = {
    name: 'Building Project Manifest',
    thunk: () => buildProjectManifest(meta),
  };

  const runner = new TaskRunner([
    dumpMapsTask,
    buildProjectManifestTask,
  ]);

  runner.run().catch(() => process.exit(1));
}

main(process.argv);
