import * as fs from 'fs';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse, { NodePath, Node } from '@babel/traverse';
import {
  CallExpression,
  FunctionDeclaration as BabelFunctionDeclaration,
  VariableDeclarator as BabelVariableDeclarator,
  ArrowFunctionExpression,
  FunctionExpression,
  isIdentifier,
  isStringLiteral,
  isMemberExpression,
  isArrowFunctionExpression,
  isFunctionExpression,
  isFunction,
} from '@babel/types';
import { TestCase, ParsedFile } from './types';

// Rough cost estimates for common Cypress commands so we can guess how long
// a test will take just by looking at the AST. Heavier commands = higher weight.
const COMMAND_WEIGHTS: Record<string, number> = {
  visit: 800,
  request: 500,
  intercept: 400,
  wait: 300,
  go: 600,
  reload: 700,
  get: 150,
  find: 150,
  contains: 100,
  query: 100,
  click: 200,
  type: 200,
  clear: 200,
  select: 200,
  trigger: 200,
  scrollIntoView: 200,
  scrollTo: 200,
  fixture: 100,
  readFile: 100,
  writeFile: 100,
  screenshot: 600,
  viewport: 50,
  setCookie: 50,
  clearCookie: 50,
  exec: 400,
  task: 400,
};

// Is this a test-declaration call like it('foo', …) or test('foo', …)?
function isTestCall(
  node: CallExpression
): { keyword: string; modifier?: string } | undefined {
  const callee = node.callee;

  // direct call: it(…) | test(…) | specify(…)
  if (isIdentifier(callee)) {
    const name = callee.name;
    if (name === 'it' || name === 'test' || name === 'specify') {
      return { keyword: name };
    }
    return undefined;
  }

  // member call: it.only(…) | it.skip(…) | test.only(…) etc.
  if (isMemberExpression(callee)) {
    if (
      isIdentifier(callee.object) &&
      isIdentifier(callee.property) &&
      (callee.object.name === 'it' ||
        callee.object.name === 'test' ||
        callee.object.name === 'specify')
    ) {
      const modifier = callee.property.name;
      if (modifier === 'only' || modifier === 'skip') {
        return { keyword: callee.object.name, modifier };
      }
    }
  }

  return undefined;
}

// Grab the first string-literal argument from a call expression.
function getStringArg(node: CallExpression): string | undefined {
  for (const arg of node.arguments) {
    if (isStringLiteral(arg)) {
      return arg.value;
    }
  }
  return undefined;
}

// Does this AST node look like a Cypress command call (e.g. cy.visit)?
function isCommandCall(node: CallExpression): boolean {
  const callee = node.callee;
  if (isMemberExpression(callee) && isIdentifier(callee.property)) {
    const propName = callee.property.name;
    if (propName in COMMAND_WEIGHTS) {
      return true;
    }
  }
  if (isIdentifier(callee) && callee.name in COMMAND_WEIGHTS) {
    return true;
  }
  return false;
}

// Scoop up all local function declarations so we can peek inside helper
// calls when estimating test duration.
type BabelFunctionNode = BabelFunctionDeclaration | ArrowFunctionExpression | FunctionExpression;

function collectLocalFunctions(ast: Node): Map<string, BabelFunctionNode> {
  const map = new Map<string, BabelFunctionNode>();

  traverse(ast, {
    FunctionDeclaration(path: NodePath<BabelFunctionDeclaration>) {
      const id = path.node.id;
      if (id) {
        map.set(id.name, path.node);
      }
    },
    VariableDeclarator(path: NodePath<BabelVariableDeclarator>) {
      if (
        isIdentifier(path.node.id) &&
        (isArrowFunctionExpression(path.node.init) ||
          isFunctionExpression(path.node.init))
      ) {
        map.set(path.node.id.name, path.node.init);
      }
    },
  });

  return map;
}

// Parse a single spec file and pull out every test we can find,
// plus a rough guess at how long each one will take.
export function parseSpecFile(filePath: string): ParsedFile {
  const absPath = path.resolve(filePath);
  const raw = fs.readFileSync(absPath, 'utf-8');

  const ast = parse(raw, {
    sourceType: 'module',
    allowImportExportEverywhere: true,
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
  });

  const localFns = collectLocalFunctions(ast);
  const tests: TestCase[] = [];
  const commandCounts: Record<string, number> = {};
  let totalCommandWeight = 0;

  // Keep track of visited function names to prevent infinite recursion
  // when two helpers call each other.
  const visitedFns = new Set<string>();

  // Count heavy commands inside a node (and everything below it). We skip
  // nested test callbacks so we don't accidentally add inner-test commands
  // to the outer scope's weight.
  function countCommandsInNode(node: Node | null | undefined): number {
    if (!node) return 0;
    let w = 0;
    traverse(node, {
      noScope: true,
      CallExpression(path: NodePath<CallExpression>) {
        const call = path.node;
        // If this is a test declaration, skip its callback so commands
        // inside the test aren't counted in the outer scope weight.
        if (isTestCall(call)) {
          path.skip();
          return;
        }
        // Inline helper calls so we count their commands too.
        if (isIdentifier(call.callee)) {
          const fnName = call.callee.name;
          if (localFns.has(fnName) && !visitedFns.has(fnName)) {
            visitedFns.add(fnName);
            const fnNode = localFns.get(fnName)!;
            w += countCommandsInNode((fnNode as any).body);
            visitedFns.delete(fnName);
            path.skip();
            return;
          }
        }
        if (isCommandCall(call)) {
          let cmdName: string | undefined;
          if (
            isMemberExpression(call.callee) &&
            isIdentifier(call.callee.property)
          ) {
            cmdName = call.callee.property.name;
          } else if (isIdentifier(call.callee)) {
            cmdName = call.callee.name;
          }
          if (cmdName) {
            commandCounts[cmdName] = (commandCounts[cmdName] || 0) + 1;
            w += COMMAND_WEIGHTS[cmdName] ?? 50;
          }
        }
      },
    });
    return w;
  }

  // Walk the AST top-down, collecting tests and adding up command weights
  // in each scope. When we hit a test declaration, we also dive into its
  // callback to count commands *inside* that specific test.
  function traverseNode(node: Node | null | undefined, weightSoFar: number) {
    if (!node) return weightSoFar;
    let scopeWeight = 0;

    traverse(node, {
      noScope: true,
      FunctionDeclaration(path: NodePath<BabelFunctionDeclaration>) {
        if (path.node.id && localFns.has(path.node.id.name)) {
          path.skip();
        }
      },
      VariableDeclarator(path: NodePath<BabelVariableDeclarator>) {
        if (
          isIdentifier(path.node.id) &&
          localFns.has(path.node.id.name)
        ) {
          path.skip();
        }
      },
      CallExpression(path: NodePath<CallExpression>) {
        const call = path.node;

        // 1. Test declaration?
        const testMeta = isTestCall(call);
        if (testMeta) {
          const title = getStringArg(call);
          if (title) {
            // Count commands inside the test callback (second arg, typically).
            let internalWeight = 0;
            const cb = call.arguments[1];
            if (cb && isFunction(cb as any)) {
              // ArrowFunctionExpression | FunctionExpression have .body
              internalWeight = countCommandsInNode((cb as any).body);
            }
            tests.push({
              title,
              file: absPath,
              line: call.loc?.start?.line ?? 0,
              modifier:
                (testMeta.modifier as 'only' | 'skip' | undefined) ?? 'none',
              estimatedDurationMs: weightSoFar + scopeWeight + internalWeight,
            });
          }
          path.skip();
          return;
        }

        // 2. Inline local helper calls.
        if (isIdentifier(call.callee)) {
          const fnName = call.callee.name;
          if (localFns.has(fnName) && !visitedFns.has(fnName)) {
            visitedFns.add(fnName);
            const fnNode = localFns.get(fnName)!;
            scopeWeight +=
              traverseNode((fnNode as any).body, weightSoFar + scopeWeight) -
              (weightSoFar + scopeWeight);
            visitedFns.delete(fnName);
            path.skip();
            return;
          }
        }

        // 3. Heavy command call in the current scope.
        if (isCommandCall(call)) {
          let cmdName: string | undefined;
          if (
            isMemberExpression(call.callee) &&
            isIdentifier(call.callee.property)
          ) {
            cmdName = call.callee.property.name;
          } else if (isIdentifier(call.callee)) {
            cmdName = call.callee.name;
          }
          if (cmdName) {
            commandCounts[cmdName] = (commandCounts[cmdName] || 0) + 1;
            scopeWeight += COMMAND_WEIGHTS[cmdName] ?? 50;
          }
        }
      },
    });

    return weightSoFar + scopeWeight;
  }

  // Start traversal from the Program body; weight starts at 0.
  traverseNode(ast, 0);

  totalCommandWeight = Object.entries(commandCounts).reduce(
    (sum, [cmd, count]) => sum + count * (COMMAND_WEIGHTS[cmd] ?? 50),
    0
  );

  return { file: absPath, tests, commandCounts, totalCommandWeight };
}

/**
 * Expand any glob patterns in the spec list, then parse every file.
 */
export async function parseSpecs(specs: string[]): Promise<ParsedFile[]> {
  // fast-glob is dynamic-import friendly, but this package uses CJS.
  const glob = (await import('fast-glob')).default;

  const expanded: string[] = [];
  for (const pattern of specs) {
    if (glob.isDynamicPattern(pattern)) {
      const matches = await glob(pattern, { onlyFiles: true, absolute: true });
      expanded.push(...matches);
    } else {
      expanded.push(path.resolve(pattern));
    }
  }

  // Deduplicate while preserving order
  const unique = [...new Set(expanded)];

  const results: ParsedFile[] = [];
  for (const file of unique) {
    if (!fs.existsSync(file)) {
      console.warn(`Warning: spec not found: ${file}`);
      continue;
    }
    results.push(parseSpecFile(file));
  }

  return results;
}
