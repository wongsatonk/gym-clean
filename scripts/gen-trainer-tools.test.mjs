// node --test scripts/gen-trainer-tools.test.mjs
// M12 slice 2 task 6: the Swift tools for Apple's on-device model are generated from
// src/core/trainer/tools.contract.json. This test (part of `npm run check`) fails when the
// committed Swift file is stale, and covers every argument type the generator supports.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  PROPOSED_REPLY,
  SWIFT_PATH,
  generateSwift,
  readContract,
  swiftProperty,
  swiftString,
} from './gen-trainer-tools.mjs';

const tool = (name, properties = {}, required = [], extra = {}) => ({
  name,
  description: `${name} does a thing.`,
  readOnly: false,
  parameters: { type: 'object', properties, required, additionalProperties: false },
  ...extra,
});

describe('generated Swift is up to date', () => {
  it('TrainerTools.generated.swift equals a fresh generation from the contract', () => {
    const fresh = generateSwift(readContract());
    let committed = '';
    try {
      committed = readFileSync(SWIFT_PATH, 'utf8');
    } catch {
      // missing → stale
    }
    assert.equal(
      committed,
      fresh,
      'Stale Swift tools: run `node scripts/gen-trainer-tools.mjs` and commit the result.',
    );
  });

  it('has one tool per contract tool, read-only ones marked', () => {
    const contract = readContract();
    const swift = generateSwift(contract);
    for (const t of contract.tools) {
      assert.match(swift, new RegExp(`public let name = "${t.name}"`));
      const readOnlyList = swift.match(/readOnlyNames: Set<String> = \[(.*)\]/)[1];
      assert.equal(readOnlyList.includes(`"${t.name}"`), t.readOnly === true, t.name);
    }
    assert.equal((swift.match(/: Tool \{/g) ?? []).length, contract.tools.length);
  });
});

describe('argument types', () => {
  it('string enum → String + anyOf', () => {
    assert.deepEqual(swiftProperty({ type: 'string', enum: ['today', 'plan'] }, 'x'), {
      type: 'String',
      guides: ['.anyOf(["today", "plan"])'],
    });
  });

  it('pattern string → plain String, description only (TypeScript validates)', () => {
    assert.deepEqual(swiftProperty({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, 'x'), {
      type: 'String',
      guides: [],
    });
  });

  it('integer with minimum and maximum → range; one bound → minimum / maximum; none → no guide', () => {
    assert.deepEqual(swiftProperty({ type: 'integer', minimum: 2, maximum: 6 }, 'x').guides, [
      '.range(2...6)',
    ]);
    assert.deepEqual(swiftProperty({ type: 'integer', minimum: 20 }, 'x').guides, ['.minimum(20)']);
    assert.deepEqual(swiftProperty({ type: 'integer', maximum: 45 }, 'x').guides, ['.maximum(45)']);
    assert.deepEqual(swiftProperty({ type: 'integer' }, 'x'), { type: 'Int', guides: [] });
  });

  it('array of integers → [Int] with counts and an element range', () => {
    const p = swiftProperty(
      {
        type: 'array',
        items: { type: 'integer', minimum: 0, maximum: 6 },
        minItems: 3,
        maxItems: 6,
        uniqueItems: true,
      },
      'x',
    );
    assert.deepEqual(p, {
      type: '[Int]',
      guides: ['.minimumCount(3)', '.maximumCount(6)', '.element(.range(0...6))'],
    });
  });

  it('array of string enums → [String] with element anyOf', () => {
    const p = swiftProperty(
      { type: 'array', items: { type: 'string', enum: ['arms', 'legs'] }, maxItems: 6 },
      'x',
    );
    assert.deepEqual(p, {
      type: '[String]',
      guides: ['.maximumCount(6)', '.element(.anyOf(["arms", "legs"]))'],
    });
  });

  it('boolean → Bool', () => {
    assert.deepEqual(swiftProperty({ type: 'boolean' }, 'x'), { type: 'Bool', guides: [] });
  });

  it('rejects what it cannot express', () => {
    assert.throws(() => swiftProperty({ type: 'number' }, 'x'), /unsupported type/);
    assert.throws(() => swiftProperty({ type: 'object' }, 'x'), /unsupported type/);
    assert.throws(() => swiftProperty({ type: 'array', items: { type: 'object' } }, 'x'), /arrays/);
    assert.throws(() => swiftProperty({ type: 'integer', enum: [1, 2] }, 'x'), /integer enums/);
    assert.throws(() => swiftProperty({ type: 'string', enum: [1] }, 'x'), /string enums/);
    assert.throws(() => swiftProperty({ type: 'integer', minimum: 1.5 }, 'x'), /integer/);
    assert.throws(
      () => swiftProperty({ type: 'integer', minimum: 5, maximum: 2 }, 'x'),
      /minimum > maximum/,
    );
  });
});

describe('generateSwift', () => {
  const contract = {
    tools: [
      tool(
        'moveIt',
        {
          mode: { type: 'string', description: 'How "far"', enum: ['a', 'b'] },
          to: { type: 'string', description: 'Date', pattern: '^x$' },
          weeks: { type: 'integer', description: 'Weeks', minimum: 2, maximum: 6 },
          days: {
            type: 'array',
            description: 'Days',
            items: { type: 'integer', minimum: 0, maximum: 6 },
            minItems: 3,
          },
        },
        ['weeks'],
      ),
      tool('noArgs'),
      tool('lookUp', { exerciseId: { type: 'string', description: 'Id' } }, ['exerciseId'], {
        readOnly: true,
      }),
      tool('summary', {}, [], { readOnly: true }),
    ],
  };
  const swift = generateSwift(contract);

  it('required → non-optional, the rest optional', () => {
    assert.match(swift, /public var weeks: Int\n/);
    assert.match(swift, /public var mode: String\?\n/);
    assert.match(swift, /public var days: \[Int\]\?\n/);
  });

  it('writes guides with escaped descriptions', () => {
    assert.match(swift, /@Guide\(description: "How \\"far\\"", \.anyOf\(\["a", "b"\]\)\)/);
    assert.match(swift, /@Guide\(description: "Weeks", \.range\(2\.\.\.6\)\)/);
    assert.match(swift, /@Guide\(description: "Date"\)\n {4}public var to: String\?/);
    assert.match(swift, /\.minimumCount\(3\), \.element\(\.range\(0\.\.\.6\)\)/);
  });

  it('an empty arguments struct for a tool without parameters', () => {
    assert.match(swift, /@Generable\npublic struct NoArgsArguments \{\n\}/);
  });

  it('propose tools record and return the fixed reply; read-only tools read results', () => {
    assert.match(swift, /recorder\.record\(name: name, arguments: arguments\.generatedContent\)/);
    assert.ok(swift.includes(`proposedReply = ${swiftString(PROPOSED_REPLY)}`));
    assert.match(swift, /results\.text\(for: name, exerciseId: arguments\.exerciseId\)/);
    assert.match(swift, /results\.text\(for: name\)\n/);
    assert.match(swift, /MoveItTool\(recorder: recorder\)/);
    assert.match(swift, /LookUpTool\(results: results\)/);
  });

  it('backticks a Swift keyword property name', () => {
    const s = generateSwift({ tools: [tool('t', { default: { type: 'string' } })] });
    assert.match(s, /public var `default`: String\?/);
  });

  it('rejects bad contracts', () => {
    assert.throws(() => generateSwift({ tools: [] }), /no tools/);
    assert.throws(() => generateSwift({ tools: [tool('a-b')] }), /identifier/);
    assert.throws(() => generateSwift({ tools: [tool('a'), tool('a')] }), /duplicate/);
    assert.throws(
      () => generateSwift({ tools: [{ ...tool('a'), description: '' }] }),
      /description/,
    );
    assert.throws(() => generateSwift({ tools: [tool('a', {}, ['x'])] }), /required "x"/);
    assert.throws(
      () => generateSwift({ tools: [tool('a', { 'bad-name': { type: 'string' } })] }),
      /identifier/,
    );
  });

  it('swiftString escapes control characters', () => {
    assert.equal(swiftString('a\nb\\c"\u0001'), '"a\\nb\\\\c\\"\\u{1}"');
  });
});
