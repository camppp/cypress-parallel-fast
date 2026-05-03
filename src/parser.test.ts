import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseSpecFile } from './parser';

function withTempFile(content: string): string {
  const tmp = path.join(os.tmpdir(), `cpf-parser-${Date.now()}-${Math.random().toString(36).slice(2)}.spec.ts`);
  fs.writeFileSync(tmp, content, 'utf-8');
  return tmp;
}

describe('parseSpecFile', () => {
  const tmpPaths: string[] = [];

  afterEach(() => {
    for (const p of tmpPaths) {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
    tmpPaths.length = 0;
  });

  function parse(content: string) {
    const p = withTempFile(content);
    tmpPaths.push(p);
    return parseSpecFile(p);
  }

  /* ---------------------------------------------------------------- */
  /* 1. Whole file is a function call that spawns describe() + it()   */
  /* ---------------------------------------------------------------- */
  it('finds tests inside a top-level helper that wraps describe/it', () => {
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
    expect(result.tests).toHaveLength(2);
    expect(result.tests.map((t) => t.title)).toEqual([
      'should pass',
      'should also pass',
    ]);
  });

  it('finds tests when the helper is an arrow function variable', () => {
    const result = parse(`
const runAll = () => {
  describe('All', () => {
    it('test one', () => { cy.visit('/'); });
  });
};

runAll();
`);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].title).toBe('test one');
  });

  /* ---------------------------------------------------------------- */
  /* 2. Multi-level recursive function calls to it()/describe()       */
  /* ---------------------------------------------------------------- */
  it('handles two-level helper nesting (outer -> inner -> it)', () => {
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
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].title).toBe('deep test');
    // wait + weight of 300
    expect(result.tests[0].estimatedDurationMs).toBe(300);
  });

  it('handles three-level helper nesting', () => {
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
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].title).toBe('very deep');
  });

  it('counts commands through nested helpers', () => {
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
    expect(result.tests[0].estimatedDurationMs).toBe(1100);
  });

  it('does not double-count when a helper is used by multiple tests', () => {
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
    expect(result.tests[0].estimatedDurationMs).toBe(300);
    expect(result.tests[1].estimatedDurationMs).toBe(300);
  });

  it('handles mutually recursive helpers (should not infinite loop)', () => {
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
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].title).toBe('recursion guard');
  });

  /* ---------------------------------------------------------------- */
  /* 3. Common Cypress spec patterns that might NOT be supported      */
  /* ---------------------------------------------------------------- */
  it('MISSING: template literal in it() title is skipped', () => {
    const result = parse(`
const name = 'dynamic';
describe('Suite', () => {
  it(\`test \${name}\`, () => { cy.visit('/'); });
});
`);
    // getStringArg only checks isStringLiteral, not template literals.
    // This is a known gap — the test documents current behavior.
    expect(result.tests).toHaveLength(0);
  });

  it('MISSING: variable reference in it() title is skipped', () => {
    const result = parse(`
const titles = ['a', 'b'];
describe('Suite', () => {
  titles.forEach((title) => {
    it(title, () => { cy.visit('/'); });
  });
});
`);
    // getStringArg returns undefined for non-string-literal first args.
    expect(result.tests).toHaveLength(0);
  });

  it('MISSING: computed member expression it[expr]() is skipped', () => {
    const result = parse(`
describe('Suite', () => {
  const method = 'only';
  it[method]('computed', () => { cy.visit('/'); });
});
`);
    // isTestCall only handles direct identifiers and simple member expressions.
    expect(result.tests).toHaveLength(0);
  });

  it('SUPPORTED: it.only and it.skip modifiers are parsed', () => {
    const result = parse(`
describe('Suite', () => {
  it.only('focused', () => { cy.visit('/'); });
  it.skip('skipped', () => { cy.get('body'); });
});
`);
    expect(result.tests).toHaveLength(2);
    expect(result.tests[0].modifier).toBe('only');
    expect(result.tests[1].modifier).toBe('skip');
  });

  it('SUPPORTED: describe.only / describe.skip still expose inner tests', () => {
    const result = parse(`
describe.only('Focused suite', () => {
  it('inside only', () => { cy.visit('/'); });
});

describe.skip('Skipped suite', () => {
  it('inside skip', () => { cy.visit('/'); });
});
`);
    // describe is not special-cased, so traversal still visits its body.
    expect(result.tests).toHaveLength(2);
  });

  it('SUPPORTED: test() and specify() aliases work', () => {
    const result = parse(`
describe('Suite', () => {
  test('alias test', () => { cy.visit('/'); });
  specify('alias specify', () => { cy.get('body'); });
});
`);
    expect(result.tests).toHaveLength(2);
    expect(result.tests.map((t) => t.title)).toContain('alias test');
    expect(result.tests.map((t) => t.title)).toContain('alias specify');
  });

  it('handles top-level it() without any describe()', () => {
    const result = parse(`
it('standalone', () => {
  cy.visit('/');
});
`);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].title).toBe('standalone');
  });

  it('handles deeply nested describe blocks', () => {
    const result = parse(`
describe('Level 1', () => {
  describe('Level 2', () => {
    describe('Level 3', () => {
      it('deep', () => { cy.visit('/'); });
    });
  });
});
`);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].title).toBe('deep');
  });

  it('ignores comments and empty files gracefully', () => {
    const result = parse(`
// just a comment
/* multi
   line */
`);
    expect(result.tests).toHaveLength(0);
    expect(result.totalCommandWeight).toBe(0);
  });

  it('parses TypeScript type annotations without crashing', () => {
    const result = parse(`
interface Foo { bar: string; }

function helper(x: Foo): void {
  cy.visit('/');
}

describe('TS', () => {
  it('works', () => { helper({ bar: 'a' }); });
});
`);
    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].title).toBe('works');
  });
});
