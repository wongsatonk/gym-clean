#!/usr/bin/env node
// M12 slice 2 task 6 (M10 B3): builds the Swift tools for Apple's on-device model from the single
// source src/core/trainer/tools.contract.json (written by src/core/trainer/tools.test.ts).
//
//   node scripts/gen-trainer-tools.mjs          # write the Swift file
//   node scripts/gen-trainer-tools.mjs --check  # exit 1 if the committed file is stale
//
// scripts/gen-trainer-tools.test.mjs runs the same check inside `npm run check`, so a contract
// change without a regenerated Swift file fails the build.
//
// Output: one `@Generable` arguments struct and one `Tool` per contract tool, in the GymBrainCore
// Swift package (so the XCTests compile and call them). Choices (docs/ios-setup.md "Slice 2 API
// notes" §1, and Decision "M12 slice 2, G1 build calls"):
// - Every token counts (4,096-token window shared with the context), so guides stay short: the
//   contract's own descriptions, nothing added.
// - String enums → `String` + `.anyOf([...])` (no Swift enum names to invent; the recorded value is
//   the plain string). Integer bounds → `.range` / `.minimum` / `.maximum`. Arrays → `[String]` /
//   `[Int]` with `.minimumCount` / `.maximumCount` and `.element(...)` for the item guide.
// - `pattern` strings (dates, exercise ids) get the description only, no regex guide: TypeScript
//   validates every argument before it becomes a proposal, and a regex guide the model can't
//   satisfy would fail the whole reply. `uniqueItems` is likewise checked in TypeScript.
// - Propose tools only record `{ name, args }` (thread-safe; calls can run in parallel) and return
//   PROPOSED_REPLY. Read-only tools return the result the app passed in with the request.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRACT_PATH = resolve(root, 'src/core/trainer/tools.contract.json');
export const SWIFT_PATH = resolve(
  root,
  'ios/App/App/Plugins/GymBrain/GymBrainCore/Sources/GymBrainCore/TrainerTools.generated.swift',
);

export const PROPOSED_REPLY = 'Proposed; the app will ask the user to confirm.';

const SWIFT_KEYWORDS = new Set([
  'associatedtype',
  'class',
  'deinit',
  'enum',
  'extension',
  'func',
  'import',
  'init',
  'inout',
  'internal',
  'let',
  'operator',
  'private',
  'protocol',
  'public',
  'static',
  'struct',
  'subscript',
  'typealias',
  'var',
  'break',
  'case',
  'continue',
  'default',
  'defer',
  'do',
  'else',
  'fallthrough',
  'for',
  'guard',
  'if',
  'in',
  'repeat',
  'return',
  'switch',
  'where',
  'while',
  'as',
  'catch',
  'false',
  'is',
  'nil',
  'rethrows',
  'super',
  'self',
  'Self',
  'throw',
  'throws',
  'true',
  'try',
  'any',
  'some',
  'Type',
]);

const IDENT = /^[A-Za-z][A-Za-z0-9]*$/;

/** A Swift string literal (escapes quotes, backslashes and control characters). */
export function swiftString(s) {
  if (typeof s !== 'string') throw new Error(`expected a string, got ${typeof s}`);
  let body = '';
  for (const c of s) {
    if (c === '\\') body += '\\\\';
    else if (c === '"') body += '\\"';
    else if (c === '\n') body += '\\n';
    else if (c === '\t') body += '\\t';
    else if (c === '\r') body += '\\r';
    else if (c.charCodeAt(0) < 0x20) body += `\\u{${c.charCodeAt(0).toString(16)}}`;
    else body += c;
  }
  return `"${body}"`;
}

const pascal = (name) => name.charAt(0).toUpperCase() + name.slice(1);

function identifier(name, what) {
  if (typeof name !== 'string' || !IDENT.test(name)) {
    throw new Error(`${what} "${String(name)}" is not a plain identifier`);
  }
  return SWIFT_KEYWORDS.has(name) ? `\`${name}\`` : name;
}

function intBound(v, what) {
  if (v === undefined) return undefined;
  if (!Number.isInteger(v)) throw new Error(`${what} must be an integer`);
  return v;
}

/** The guide for one integer: `.range(a...b)`, `.minimum(a)`, `.maximum(b)` or none. */
function intGuide(schema, where) {
  const min = intBound(schema.minimum, `${where}.minimum`);
  const max = intBound(schema.maximum, `${where}.maximum`);
  if (min !== undefined && max !== undefined) {
    if (min > max) throw new Error(`${where}: minimum > maximum`);
    return `.range(${min}...${max})`;
  }
  if (min !== undefined) return `.minimum(${min})`;
  if (max !== undefined) return `.maximum(${max})`;
  return undefined;
}

function enumGuide(schema, where) {
  if (!Array.isArray(schema.enum) || schema.enum.length === 0) return undefined;
  for (const v of schema.enum) {
    if (typeof v !== 'string') throw new Error(`${where}: only string enums are supported`);
  }
  return `.anyOf([${schema.enum.map(swiftString).join(', ')}])`;
}

/** `{ type, guides }` for one property schema. */
export function swiftProperty(schema, where) {
  if (!schema || typeof schema !== 'object') throw new Error(`${where}: missing schema`);
  switch (schema.type) {
    case 'string': {
      const g = enumGuide(schema, where);
      return { type: 'String', guides: g ? [g] : [] };
    }
    case 'integer': {
      if (schema.enum) throw new Error(`${where}: integer enums are not supported`);
      const g = intGuide(schema, where);
      return { type: 'Int', guides: g ? [g] : [] };
    }
    case 'boolean':
      return { type: 'Bool', guides: [] };
    case 'array': {
      const items = schema.items;
      if (!items || (items.type !== 'string' && items.type !== 'integer')) {
        throw new Error(`${where}: arrays of strings or integers only`);
      }
      const item = swiftProperty(items, `${where}.items`);
      const guides = [];
      const minItems = intBound(schema.minItems, `${where}.minItems`);
      const maxItems = intBound(schema.maxItems, `${where}.maxItems`);
      if (minItems !== undefined) guides.push(`.minimumCount(${minItems})`);
      if (maxItems !== undefined) guides.push(`.maximumCount(${maxItems})`);
      if (item.guides.length > 0) guides.push(`.element(${item.guides[0]})`);
      return { type: `[${item.type}]`, guides };
    }
    default:
      throw new Error(`${where}: unsupported type "${String(schema.type)}"`);
  }
}

function argumentsStruct(tool, structName) {
  const params = tool.parameters ?? { properties: {}, required: [] };
  if (params.type !== undefined && params.type !== 'object') {
    throw new Error(`${tool.name}: parameters must be an object schema`);
  }
  const required = new Set(params.required ?? []);
  const props = Object.entries(params.properties ?? {});
  for (const r of required) {
    if (!props.some(([k]) => k === r))
      throw new Error(`${tool.name}: required "${r}" is not a property`);
  }
  const lines = [`@Generable`, `public struct ${structName} {`];
  for (const [key, schema] of props) {
    const name = identifier(key, `${tool.name} property`);
    const { type, guides } = swiftProperty(schema, `${tool.name}.${key}`);
    const desc =
      typeof schema.description === 'string' && schema.description ? schema.description : undefined;
    const args = [];
    if (desc) args.push(`description: ${swiftString(desc)}`);
    args.push(...guides);
    if (args.length > 0) lines.push(`    @Guide(${args.join(', ')})`);
    lines.push(`    public var ${name}: ${type}${required.has(key) ? '' : '?'}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function toolStruct(tool, structName, argsName) {
  const lines = [
    `public struct ${structName}: Tool {`,
    `    public let name = ${swiftString(tool.name)}`,
    `    public let description = ${swiftString(tool.description)}`,
  ];
  if (tool.readOnly) {
    lines.push('    let results: ReadToolResults');
    lines.push(`    public func call(arguments: ${argsName}) async throws -> String {`);
    const hasId = Object.hasOwn(tool.parameters?.properties ?? {}, 'exerciseId');
    lines.push(
      hasId
        ? '        results.text(for: name, exerciseId: arguments.exerciseId)'
        : '        results.text(for: name)',
    );
  } else {
    lines.push('    let recorder: ToolCallRecorder');
    lines.push(`    public func call(arguments: ${argsName}) async throws -> String {`);
    lines.push('        recorder.record(name: name, arguments: arguments.generatedContent)');
    lines.push('        return TrainerTools.proposedReply');
  }
  lines.push('    }', '}');
  return lines.join('\n');
}

/** The whole Swift file for a parsed contract. Throws on anything it can't express. */
export function generateSwift(contract) {
  if (!contract || !Array.isArray(contract.tools) || contract.tools.length === 0) {
    throw new Error('contract has no tools');
  }
  const seen = new Set();
  const parts = [];
  const makers = [];
  for (const tool of contract.tools) {
    identifier(tool.name, 'tool name');
    if (seen.has(tool.name)) throw new Error(`duplicate tool "${tool.name}"`);
    seen.add(tool.name);
    if (typeof tool.description !== 'string' || !tool.description) {
      throw new Error(`${tool.name}: missing description`);
    }
    const base = pascal(tool.name);
    const argsName = `${base}Arguments`;
    const toolName = `${base}Tool`;
    parts.push(`// MARK: ${tool.name}${tool.readOnly ? ' (read-only)' : ''}`);
    parts.push(argumentsStruct(tool, argsName));
    parts.push(toolStruct(tool, toolName, argsName));
    makers.push(
      tool.readOnly ? `${toolName}(results: results)` : `${toolName}(recorder: recorder)`,
    );
  }
  const names = contract.tools.map((t) => swiftString(t.name));
  const readOnly = contract.tools.filter((t) => t.readOnly).map((t) => swiftString(t.name));
  return `// GENERATED by scripts/gen-trainer-tools.mjs from src/core/trainer/tools.contract.json.
// Do not edit: run \`node scripts/gen-trainer-tools.mjs\`. \`npm run check\` fails when it is stale.
import Foundation
import FoundationModels

public enum TrainerTools {
    /// What every propose tool tells the model. The app shows a card; nothing changes without a tap.
    public static let proposedReply = ${swiftString(PROPOSED_REPLY)}
    /// Every tool name, in contract order.
    public static let names: [String] = [${names.join(', ')}]
    /// Tools that answer from \`toolResults\` and never record a call.
    public static let readOnlyNames: Set<String> = [${readOnly.join(', ')}]

    /// One fresh set per \`respond\` (each session gets its own recorder and results).
    public static func make(recorder: ToolCallRecorder, results: ReadToolResults) -> [any Tool] {
        [
${makers.map((m) => `            ${m},`).join('\n')}
        ]
    }
}

${parts.join('\n\n')}
`;
}

export function readContract(path = CONTRACT_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(argv) {
  const swift = generateSwift(readContract());
  if (argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(SWIFT_PATH, 'utf8');
    } catch {
      // missing counts as stale
    }
    if (current !== swift) {
      console.error(
        'TrainerTools.generated.swift is stale: run node scripts/gen-trainer-tools.mjs',
      );
      process.exit(1);
    }
    console.log('TrainerTools.generated.swift is up to date.');
    return;
  }
  writeFileSync(SWIFT_PATH, swift);
  console.log(`Wrote ${SWIFT_PATH}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
