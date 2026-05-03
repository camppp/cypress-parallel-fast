/**
 * Merge multiple JUnit XML files produced by individual Cypress worker runs
 * into one combined report. We delegate the actual XML wrangling to
 * junit-report-merger since hand-rolling it is a minefield of edge cases.
 */
export declare function mergeJUnitFiles(inputDir: string, outputPath: string): Promise<number>;
//# sourceMappingURL=junit.d.ts.map