import {
  addressToOffset,
  ArraySchema,
  BitfieldSchema,
  BooleanSchema,
  Byte,
  CaseSchema,
  CompressionSchema,
  EnumSchema,
  HalfWord,
  ImageSchema,
  ListSchema,
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

const NpcEntity = new StructureSchema([
  ['id', Byte],
  ['sprite', Byte],
  ['replacement', Byte],
  [null, Byte],
  ['x', HalfWord],
  ['y', HalfWord],
  ['height', Byte],
  ['behavior', Byte], // TODO: Enum
  ['boundary', new BitfieldSchema([
    ['x', 4],
    ['y', 4],
  ])],
  [null, Byte],
  ['property', Byte],
  [null, Byte],
  ['view_radius', HalfWord],
  ['script', Word],
  ['flag', HalfWord],
  [null, new PaddingSchema(2)],
]);

const WarpEntity = new StructureSchema([
  ['x', HalfWord],
  ['y', HalfWord],
  ['height', Byte],
  ['warp', Byte],
  ['map', Byte],
  ['bank', Byte],
]);

const TriggerEntity = new StructureSchema([
  ['x', HalfWord],
  ['y', HalfWord],
  ['height', Byte],
  [null, Byte],
  ['variable', HalfWord],
  ['value', HalfWord],
  [null, Byte],
  [null, Byte],
  ['script', Word],
]);

const SignEntity = new StructureSchema([
  ['x', HalfWord],
  ['y', HalfWord],
  ['height', Byte],
  ['type', new NamedValueSchema('type', new EnumSchema(new Map([
    [0, 'script'],
    [1, 'script_up'],
    [2, 'script_down'],
    [3, 'script_right'],
    [4, 'script_left'],
    [5, 'hidden_item'],
    [6, 'hidden_item1'],
    [7, 'hidden_item2'],
    [8, 'secret_base'],
  ]), Byte, true))],
  [null, new PaddingSchema(2)],
  ['data', new CaseSchema([{
    name: 'type',
    condition: {
      any: [
        { eq: 'script' },
        { eq: 'script_up' },
        { eq: 'script_down' },
        { eq: 'script_right' },
        { eq: 'script_left' },
      ],
    },
    schema: new StructureSchema([
      ['script', Word],
    ]),
  }, {
    name: 'type',
    condition: {
      any: [
        { eq: 'hidden_item' },
        { eq: 'hidden_item1' },
        { eq: 'hidden_item2' },
      ],
    },
    schema: new StructureSchema([
      ['item', HalfWord],
      ['id', Byte],
      ['data', new BitfieldSchema([
        ['amount', 7],
        ['exact_required', 1],
      ])],
    ]),
  }, {
    name: 'type',
    condition: { eq: 'secret_base' },
    schema: new StructureSchema([
      ['id', Word],
    ]),
  }])],
]);

const EntityTable = new StructureSchema([
  [null, new NamedValueSchema('npc_count', Byte)],
  [null, new NamedValueSchema('warp_count', Byte)],
  [null, new NamedValueSchema('trigger_count', Byte)],
  [null, new NamedValueSchema('sign_count', Byte)],
  ['npcs', new PointerSchema(new ArraySchema(NpcEntity, 'npc_count'))],
  ['warps', new PointerSchema(new ArraySchema(WarpEntity, 'warp_count'))],
  ['triggers', new PointerSchema(new ArraySchema(TriggerEntity, 'trigger_count'))],
  ['signs', new PointerSchema(new ArraySchema(SignEntity, 'sign_count'))],
]);

const ScriptTableEntry = new StructureSchema([
  ['type', new NamedValueSchema('type', new EnumSchema(new Map([
    [0, 'sentinel'],
    [1, 'setmaptile'],
    [2, 'handler_env1'],
    [3, 'onmapenter'],
    [4, 'handler_env2'],
    [5, 'closemenu1'],
    [6, 'unknown'],
    [7, 'closemenu2'],
  ]), Byte, true))],
  ['data', new CaseSchema([{
    name: 'type',
    condition: { eq: 'sentinel' },
    schema: null,
  }, {
    name: 'type',
    condition: {
      any: [
        { eq: 'setmaptile' },
        { eq: 'onmapenter' },
        { eq: 'closemenu1' },
        { eq: 'unknown' },
        { eq: 'closemenu2' },
      ],
    },
    schema: Word,
  }, {
    name: 'type',
    condition: {
      any: [
        { eq: 'handler_env1' },
        { eq: 'handler_env2' },
      ],
    },
    schema: new PointerSchema(new ListSchema(new StructureSchema([
      ['variable', new NamedValueSchema('variable', HalfWord)],
      ['data', new CaseSchema([{
        name: 'variable',
        condition: { eq: 0 },
        schema: null,
      }, {
        name: 'variable',
        condition: {},
        schema: new StructureSchema([
          ['value', HalfWord],
          ['script', Word],
        ]),
      }])],
    ]), { variable: 0, data: null })),
  }])],
]);

const ScriptTable = new ListSchema(ScriptTableEntry, {
  type: 'sentinel',
  data: null,
});

const MapHeader = new StructureSchema([
  ['data', new PointerSchema(MapData)],
  ['entities', new PointerSchema(EntityTable)],
  ['scripts', new PointerSchema(ScriptTable)],
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
