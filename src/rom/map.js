import {
  addressToOffset,
  ArraySchema,
  BitfieldSchema,
  BooleanSchema,
  Byte,
  CompressionSchema,
  EnumSchema,
  HalfWord,
  ImageSchema,
  NamedValueSchema,
  PaddingSchema,
  PaletteSchema,
  PointerSchema,
  SignedWord,
  StructureSchema,
  TupleSchema,
  Word,
} from '@Touched/gba-serialize';

const Block = new BitfieldSchema([
  ['block', 10],
  ['collision', 2],
  ['height', 4],
]);

const BlockDefinition = new ArraySchema(new BitfieldSchema([
  ['tile', 10],
  ['flipX', 1],
  ['flipY', 1],
  ['palette', 4],
]), 8);

const BlockBehavior = new StructureSchema([
  ['behavior', Byte],
  [null, HalfWord],
  ['background', Byte],
]);

const Blockset = new PointerSchema(new StructureSchema([
  ['compressed', new BooleanSchema(Byte)],
  ['secondary', new BooleanSchema(Byte)],
  [null, HalfWord],
  // FIXME: Allow for uncompressed tiles (using a conditional schema)
  ['tiles', new PointerSchema(new CompressionSchema(new ImageSchema(128, 320, { bpp: 4 })))],

  // FIXME: Figure out the correct number of palettes
  ['palette', new PointerSchema(new ArraySchema(new PaletteSchema(16), 16))],
  // TODO: Conditional constants. 640 in primary tileset, 384 in secondary (FRLG) or 512 each (RSE)
  ['blocks', new PointerSchema(new ArraySchema(BlockDefinition, 640))],
  ['funcptr', Word],
  ['behaviors', new PointerSchema(new ArraySchema(BlockBehavior, 640))],
]));

const MapData = new StructureSchema([
  ['width', new NamedValueSchema('width', Word)],
  ['height', new NamedValueSchema('height', Word)],
  ['borderblock', new PointerSchema(
    new ArraySchema(
      new ArraySchema(Block, 'bb_width'),
      'bb_height',
    ),
  )],
  ['data', new PointerSchema(new ArraySchema(new ArraySchema(Block, 'width'), 'height'))],
  ['blockset1', Blockset],
  ['blockset2', Blockset],
  ['bb_width', new NamedValueSchema('bb_width', Byte)],
  ['bb_height', new NamedValueSchema('bb_height', Byte)],
  [null, HalfWord],
]);

const Connection = new StructureSchema([
  ['direction', new EnumSchema(new Map([
    [0, 'none'],
    [1, 'down'],
    [2, 'up'],
    [3, 'left'],
    [4, 'right'],
    [5, 'dive'],
    [6, 'emerge'],
  ]), Byte)],
  [null, new PaddingSchema(3)],
  ['offset', SignedWord],
  ['bank', Byte],
  ['map', Byte],
  [null, new PaddingSchema(2)],
]);

const ConnectionTable = new StructureSchema([
  ['count', new NamedValueSchema('count', Word)],
  ['connections', new PointerSchema(new ArraySchema(Connection, 'count'))]
]);

const MapHeader = new StructureSchema([
  ['data', new PointerSchema(MapData)],
  ['events', Word],
  ['scripts', Word],
  ['connections', new PointerSchema(ConnectionTable)],
  ['music', HalfWord],
  ['mapindex', HalfWord],
  ['name', Byte],
  ['cave', Byte],
  ['weather', Byte],
  ['light', Byte],
  ['pad', Byte],
  ['escape', Byte],
  ['showname', Byte],
  ['battletype', Byte],
]);

export function readMapsTable(
  rom: Buffer,
  address: number,
  bankSizes: Array<number>,
): Array<Array<number>> {
  const MapBankTable = new PointerSchema(new TupleSchema([...bankSizes.map(
    size => new PointerSchema(new ArraySchema(Word, size)),
  )]));

  const unpacked = MapBankTable.unpack(rom, addressToOffset(address));

  return unpacked.target.map(({ target }) => target);
}

export function readMap(rom: Buffer, address: number) {
  return MapHeader.unpack(rom, addressToOffset(address));
}
