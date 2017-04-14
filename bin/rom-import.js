#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const uuid = require('uuid/v4');
const png = require('@Touched/indexed-png');
const map = require('../lib/rom/map.js');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

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

  mkdirp(dir, (error) => {
    if (error) {
      throw error;
    }

    fs.writeFile(p, JSON.stringify(data, null, 2), (error) => {
      if (error) {
        throw error;
      }
    });
  });
}

function processBlockset(id, blockset) {
  const blocksetPath = path.join('blocksets', id.toString(16), 'blockset.json');
  const tilesPath = path.join('blocksets', id.toString(16), 'tiles.png');
  const o = path.join(outputDirectory, blocksetPath);

  return new Promise((resolve, reject) => {
    if (fs.existsSync(o)) {
      fs.readFile(o, 'utf8', (error, data) => {
        if (error) {
          return reject(error);
        }

        console.log('data', JSON.parse(data).meta);
      });
    }

    mkdirp(path.dirname(o), (error) => {
      if (error) {
        return reject(error);
      }

      fs.writeFileSync(o);

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
          id: uuid(),
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

      resolve(blocksetData.meta.id);
    });
  });
}

if (cluster.isMaster) {
  if (fs.existsSync(outputDirectory)) {
    console.log('Output directory already exists');
    process.exit(0);
  }

  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    worker.on('message', handleMessage);
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

  function handleMessage(message) {
    switch (message.type) {
    case 'map':
      // Fetch a new map
      const nextMap = maps.pop();
      const worker = cluster.workers[message.id];

      if (nextMap) {
        worker.send({
          type: 'map',
          address: nextMap.address,
          bank: nextMap.bank,
          map: nextMap.map,
        });
      } else {
        worker.kill();
      }
      break;
    default:
      console.error(`Invalid message type: ${message.type}. Shutting down...`);
      cluster.disconnect(() => process.exit(1));
    }
  }
} else {
  function requestNewMap() {
    // Fetch a new map
    process.send({
      type: 'map',
      id: cluster.worker.id,
    });
  }

  function handleMessage(message) {
    switch (message.type) {
    case 'map':
      // Got a new map
      const data = map.readMap(rom, message.address);

      const mapData = {
        meta: {
          format: {
            type: 'map',
            version: '0.1.0',
          },
          name: `Map ${message.map}`,
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
            data: null, //simplifyObjectArray(flatten(data.data.target.data.target)),
          },
          blocksets: {
            primary: data.data.target.blockset1.address.toString(16),
            secondary: data.data.target.blockset2.address.toString(16),
          },
          scripts: null,
          connections: data.connections.target ? data.connections.target.connections.target : [],
          entities: null,
        }
      };

      const mapFile = path.join('banks', `${message.bank}`, `${message.map}`, 'map.json');

      writeJSON(mapFile, mapData);

      processBlockset(data.data.target.blockset1.address, data.data.target.blockset1.target);
      processBlockset(data.data.target.blockset2.address, data.data.target.blockset2.target);

      requestNewMap();
      break;
    default:
      console.error(`Invalid message type: ${message.type}. Shutting down...`);
      cluster.disconnect(() => process.exit(1));
    }
  }

  process.on('message', handleMessage);
  requestNewMap();
}
