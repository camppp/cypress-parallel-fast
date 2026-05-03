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
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const parser_1 = require("./parser");
function withTempFile(content) {
    const tmp = path.join(os.tmpdir(), `cpf-parser-${Date.now()}-${Math.random().toString(36).slice(2)}.spec.ts`);
    fs.writeFileSync(tmp, content, 'utf-8');
    return tmp;
}
(0, vitest_1.describe)('parseSpecFile', () => {
    const tmpPaths = [];
    (0, vitest_1.afterEach)(() => {
        for (const p of tmpPaths) {
            try {
                fs.unlinkSync(p);
            }
            catch { /* ignore */ }
        }
        tmpPaths.length = 0;
    });
    function parse(content) {
        const p = withTempFile(content);
        tmpPaths.push(p);
        return (0, parser_1.parseSpecFile)(p);
    }
    /* ---------------------------------------------------------------- */
    /* 1. Whole file is a function call that spawns describe() + it()   */
    /* ---------------------------------------------------------------- */
    (0, vitest_1.it)('finds tests inside a top-level helper that wraps describe/it', () => {
        const result = parse(`
function runValidation() {
  describe('Validation', () => {
    it('should pass', () => {
      cy.visit('/');
    });
    it('should also pass', () => {
      cy.get('body');
    });
  });
}

runValidation();
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(2);
        (0, vitest_1.expect)(result.tests.map((t) => t.title)).toEqual([
            'should pass',
            'should also pass',
        ]);
    });
    (0, vitest_1.it)('finds tests when the helper is an arrow function variable', () => {
        const result = parse(`
const runAll = () => {
  describe('All', () => {
    it('test one', () => { cy.visit('/'); });
  });
};

runAll();
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(1);
        (0, vitest_1.expect)(result.tests[0].title).toBe('test one');
    });
    /* ---------------------------------------------------------------- */
    /* 2. Multi-level recursive function calls to it()/describe()       */
    /* ---------------------------------------------------------------- */
    (0, vitest_1.it)('handles two-level helper nesting (outer -> inner -> it)', () => {
        const result = parse(`
function inner() {
  it('deep test', () => {
    cy.wait(100);
  });
}

function outer() {
  inner();
}

outer();
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(1);
        (0, vitest_1.expect)(result.tests[0].title).toBe('deep test');
        // wait + weight of 300
        (0, vitest_1.expect)(result.tests[0].estimatedDurationMs).toBe(300);
    });
    (0, vitest_1.it)('handles three-level helper nesting', () => {
        const result = parse(`
function level3() {
  it('very deep', () => { cy.request('/'); });
}

function level2() {
  level3();
}

function level1() {
  level2();
}

level1();
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(1);
        (0, vitest_1.expect)(result.tests[0].title).toBe('very deep');
    });
    (0, vitest_1.it)('counts commands through nested helpers', () => {
        const result = parse(`
function helperB() {
  cy.wait(100);
}

function helperA() {
  helperB();
  cy.visit('/');
}

describe('Suite', () => {
  it('weighted', () => {
    helperA();
  });
});
`);
        // wait (300) + visit (800) = 1100
        (0, vitest_1.expect)(result.tests[0].estimatedDurationMs).toBe(1100);
    });
    (0, vitest_1.it)('does not double-count when a helper is used by multiple tests', () => {
        const result = parse(`
function shared() {
  cy.wait(100);
}

describe('Suite', () => {
  it('a', () => { shared(); });
  it('b', () => { shared(); });
});
`);
        // Each test only sees the commands inside its own body.
        // shared() is inlined per-test, so both get 300.
        (0, vitest_1.expect)(result.tests[0].estimatedDurationMs).toBe(300);
        (0, vitest_1.expect)(result.tests[1].estimatedDurationMs).toBe(300);
    });
    (0, vitest_1.it)('handles mutually recursive helpers (should not infinite loop)', () => {
        const result = parse(`
function a() {
  b();
  cy.wait(100);
}

function b() {
  a();
  cy.wait(100);
}

describe('Suite', () => {
  it('recursion guard', () => {
    a();
  });
});
`);
        // Should finish without hanging; exact weight depends on first call
        (0, vitest_1.expect)(result.tests).toHaveLength(1);
        (0, vitest_1.expect)(result.tests[0].title).toBe('recursion guard');
    });
    /* ---------------------------------------------------------------- */
    /* 3. Common Cypress spec patterns that might NOT be supported      */
    /* ---------------------------------------------------------------- */
    (0, vitest_1.it)('MISSING: template literal in it() title is skipped', () => {
        const result = parse(`
const name = 'dynamic';
describe('Suite', () => {
  it(\`test \${name}\`, () => { cy.visit('/'); });
});
`);
        // getStringArg only checks isStringLiteral, not template literals.
        // This is a known gap — the test documents current behavior.
        (0, vitest_1.expect)(result.tests).toHaveLength(0);
    });
    (0, vitest_1.it)('MISSING: variable reference in it() title is skipped', () => {
        const result = parse(`
const titles = ['a', 'b'];
describe('Suite', () => {
  titles.forEach((title) => {
    it(title, () => { cy.visit('/'); });
  });
});
`);
        // getStringArg returns undefined for non-string-literal first args.
        (0, vitest_1.expect)(result.tests).toHaveLength(0);
    });
    (0, vitest_1.it)('MISSING: computed member expression it[expr]() is skipped', () => {
        const result = parse(`
describe('Suite', () => {
  const method = 'only';
  it[method]('computed', () => { cy.visit('/'); });
});
`);
        // isTestCall only handles direct identifiers and simple member expressions.
        (0, vitest_1.expect)(result.tests).toHaveLength(0);
    });
    (0, vitest_1.it)('SUPPORTED: it.only and it.skip modifiers are parsed', () => {
        const result = parse(`
describe('Suite', () => {
  it.only('focused', () => { cy.visit('/'); });
  it.skip('skipped', () => { cy.get('body'); });
});
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(2);
        (0, vitest_1.expect)(result.tests[0].modifier).toBe('only');
        (0, vitest_1.expect)(result.tests[1].modifier).toBe('skip');
    });
    (0, vitest_1.it)('SUPPORTED: describe.only / describe.skip still expose inner tests', () => {
        const result = parse(`
describe.only('Focused suite', () => {
  it('inside only', () => { cy.visit('/'); });
});

describe.skip('Skipped suite', () => {
  it('inside skip', () => { cy.visit('/'); });
});
`);
        // describe is not special-cased, so traversal still visits its body.
        (0, vitest_1.expect)(result.tests).toHaveLength(2);
    });
    (0, vitest_1.it)('SUPPORTED: test() and specify() aliases work', () => {
        const result = parse(`
describe('Suite', () => {
  test('alias test', () => { cy.visit('/'); });
  specify('alias specify', () => { cy.get('body'); });
});
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(2);
        (0, vitest_1.expect)(result.tests.map((t) => t.title)).toContain('alias test');
        (0, vitest_1.expect)(result.tests.map((t) => t.title)).toContain('alias specify');
    });
    (0, vitest_1.it)('handles top-level it() without any describe()', () => {
        const result = parse(`
it('standalone', () => {
  cy.visit('/');
});
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(1);
        (0, vitest_1.expect)(result.tests[0].title).toBe('standalone');
    });
    (0, vitest_1.it)('handles deeply nested describe blocks', () => {
        const result = parse(`
describe('Level 1', () => {
  describe('Level 2', () => {
    describe('Level 3', () => {
      it('deep', () => { cy.visit('/'); });
    });
  });
});
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(1);
        (0, vitest_1.expect)(result.tests[0].title).toBe('deep');
    });
    (0, vitest_1.it)('ignores comments and empty files gracefully', () => {
        const result = parse(`
// just a comment
/* multi
   line */
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(0);
        (0, vitest_1.expect)(result.totalCommandWeight).toBe(0);
    });
    (0, vitest_1.it)('parses TypeScript type annotations without crashing', () => {
        const result = parse(`
interface Foo { bar: string; }

function helper(x: Foo): void {
  cy.visit('/');
}

describe('TS', () => {
  it('works', () => { helper({ bar: 'a' }); });
});
`);
        (0, vitest_1.expect)(result.tests).toHaveLength(1);
        (0, vitest_1.expect)(result.tests[0].title).toBe('works');
    });
});
//# sourceMappingURL=parser.test.js.map