"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSpecFile = parseSpecFile;
exports.parseSpecs = parseSpecs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const types_1 = require("@babel/types");
// Rough cost estimates for common Cypress commands so we can guess how long
// a test will take just by looking at the AST. Heavier commands = higher weight.
const COMMAND_WEIGHTS = {
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
function isTestCall(node) {
    const callee = node.callee;
    // direct call: it(…) | test(…) | specify(…)
    if ((0, types_1.isIdentifier)(callee)) {
        const name = callee.name;
        if (name === 'it' || name === 'test' || name === 'specify') {
            return { keyword: name };
        }
        return undefined;
    }
    // member call: it.only(…) | it.skip(…) | test.only(…) etc.
    if ((0, types_1.isMemberExpression)(callee)) {
        if ((0, types_1.isIdentifier)(callee.object) &&
            (0, types_1.isIdentifier)(callee.property) &&
            (callee.object.name === 'it' ||
                callee.object.name === 'test' ||
                callee.object.name === 'specify')) {
            const modifier = callee.property.name;
            if (modifier === 'only' || modifier === 'skip') {
                return { keyword: callee.object.name, modifier };
            }
        }
    }
    return undefined;
}
// Grab the first string-literal argument from a call expression.
function getStringArg(node) {
    for (const arg of node.arguments) {
        if ((0, types_1.isStringLiteral)(arg)) {
            return arg.value;
        }
    }
    return undefined;
}
// Does this AST node look like a Cypress command call (e.g. cy.visit)?
function isCommandCall(node) {
    const callee = node.callee;
    if ((0, types_1.isMemberExpression)(callee) && (0, types_1.isIdentifier)(callee.property)) {
        const propName = callee.property.name;
        if (propName in COMMAND_WEIGHTS) {
            return true;
        }
    }
    if ((0, types_1.isIdentifier)(callee) && callee.name in COMMAND_WEIGHTS) {
        return true;
    }
    return false;
}
function collectLocalFunctions(ast) {
    const map = new Map();
    (0, traverse_1.default)(ast, {
        FunctionDeclaration(path) {
            const id = path.node.id;
            if (id) {
                map.set(id.name, path.node);
            }
        },
        VariableDeclarator(path) {
            if ((0, types_1.isIdentifier)(path.node.id) &&
                ((0, types_1.isArrowFunctionExpression)(path.node.init) ||
                    (0, types_1.isFunctionExpression)(path.node.init))) {
                map.set(path.node.id.name, path.node.init);
            }
        },
    });
    return map;
}
// Parse a single spec file and pull out every test we can find,
// plus a rough guess at how long each one will take.
function parseSpecFile(filePath) {
    const absPath = path.resolve(filePath);
    const raw = fs.readFileSync(absPath, 'utf-8');
    const ast = (0, parser_1.parse)(raw, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        plugins: ['typescript', 'jsx', 'decorators-legacy'],
    });
    const localFns = collectLocalFunctions(ast);
    const tests = [];
    const commandCounts = {};
    let totalCommandWeight = 0;
    // Keep track of visited function names to prevent infinite recursion
    // when two helpers call each other.
    const visitedFns = new Set();
    // Count heavy commands inside a node (and everything below it). We skip
    // nested test callbacks so we don't accidentally add inner-test commands
    // to the outer scope's weight.
    function countCommandsInNode(node) {
        if (!node)
            return 0;
        let w = 0;
        (0, traverse_1.default)(node, {
            noScope: true,
            CallExpression(path) {
                const call = path.node;
                // If this is a test declaration, skip its callback so commands
                // inside the test aren't counted in the outer scope weight.
                if (isTestCall(call)) {
                    path.skip();
                    return;
                }
                // Inline helper calls so we count their commands too.
                if ((0, types_1.isIdentifier)(call.callee)) {
                    const fnName = call.callee.name;
                    if (localFns.has(fnName) && !visitedFns.has(fnName)) {
                        visitedFns.add(fnName);
                        const fnNode = localFns.get(fnName);
                        w += countCommandsInNode(fnNode.body);
                        visitedFns.delete(fnName);
                        path.skip();
                        return;
                    }
                }
                if (isCommandCall(call)) {
                    let cmdName;
                    if ((0, types_1.isMemberExpression)(call.callee) &&
                        (0, types_1.isIdentifier)(call.callee.property)) {
                        cmdName = call.callee.property.name;
                    }
                    else if ((0, types_1.isIdentifier)(call.callee)) {
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
    function traverseNode(node, weightSoFar) {
        if (!node)
            return weightSoFar;
        let scopeWeight = 0;
        (0, traverse_1.default)(node, {
            noScope: true,
            FunctionDeclaration(path) {
                if (path.node.id && localFns.has(path.node.id.name)) {
                    path.skip();
                }
            },
            VariableDeclarator(path) {
                if ((0, types_1.isIdentifier)(path.node.id) &&
                    localFns.has(path.node.id.name)) {
                    path.skip();
                }
            },
            CallExpression(path) {
                const call = path.node;
                // 1. Test declaration?
                const testMeta = isTestCall(call);
                if (testMeta) {
                    const title = getStringArg(call);
                    if (title) {
                        // Count commands inside the test callback (second arg, typically).
                        let internalWeight = 0;
                        const cb = call.arguments[1];
                        if (cb && (0, types_1.isFunction)(cb)) {
                            // ArrowFunctionExpression | FunctionExpression have .body
                            internalWeight = countCommandsInNode(cb.body);
                        }
                        tests.push({
                            title,
                            file: absPath,
                            line: call.loc?.start?.line ?? 0,
                            modifier: testMeta.modifier ?? 'none',
                            estimatedDurationMs: weightSoFar + scopeWeight + internalWeight,
                        });
                    }
                    path.skip();
                    return;
                }
                // 2. Inline local helper calls.
                if ((0, types_1.isIdentifier)(call.callee)) {
                    const fnName = call.callee.name;
                    if (localFns.has(fnName) && !visitedFns.has(fnName)) {
                        visitedFns.add(fnName);
                        const fnNode = localFns.get(fnName);
                        scopeWeight +=
                            traverseNode(fnNode.body, weightSoFar + scopeWeight) -
                                (weightSoFar + scopeWeight);
                        visitedFns.delete(fnName);
                        path.skip();
                        return;
                    }
                }
                // 3. Heavy command call in the current scope.
                if (isCommandCall(call)) {
                    let cmdName;
                    if ((0, types_1.isMemberExpression)(call.callee) &&
                        (0, types_1.isIdentifier)(call.callee.property)) {
                        cmdName = call.callee.property.name;
                    }
                    else if ((0, types_1.isIdentifier)(call.callee)) {
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
    totalCommandWeight = Object.entries(commandCounts).reduce((sum, [cmd, count]) => sum + count * (COMMAND_WEIGHTS[cmd] ?? 50), 0);
    return { file: absPath, tests, commandCounts, totalCommandWeight };
}
/**
 * Expand any glob patterns in the spec list, then parse every file.
 */
async function parseSpecs(specs) {
    // fast-glob is dynamic-import friendly, but this package uses CJS.
    const glob = (await Promise.resolve().then(() => __importStar(require('fast-glob')))).default;
    const expanded = [];
    for (const pattern of specs) {
        if (glob.isDynamicPattern(pattern)) {
            const matches = await glob(pattern, { onlyFiles: true, absolute: true });
            expanded.push(...matches);
        }
        else {
            expanded.push(path.resolve(pattern));
        }
    }
    // Deduplicate while preserving order
    const unique = [...new Set(expanded)];
    const results = [];
    for (const file of unique) {
        if (!fs.existsSync(file)) {
            console.warn(`Warning: spec not found: ${file}`);
            continue;
        }
        results.push(parseSpecFile(file));
    }
    return results;
}
//# sourceMappingURL=parser.js.map