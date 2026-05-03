import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore — junit-report-merger ships without types
import jrm from 'junit-report-merger';

/**
 * Merge multiple JUnit XML files produced by individual Cypress worker runs
 * into one combined report. We delegate the actual XML wrangling to
 * junit-report-merger since hand-rolling it is a minefield of edge cases.
 */
export async function mergeJUnitFiles(
  inputDir: string,
  outputPath: string,
): Promise<number> {
  let files: string[];
  try {
    files = fs
      .readdirSync(inputDir)
      .filter((f) => f.endsWith('.xml'))
      .map((f) => path.join(inputDir, f));
  } catch {
    return 0;
  }

  if (files.length === 0) return 0;

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  await jrm.mergeFiles(outputPath, files);
  return files.length;
}
