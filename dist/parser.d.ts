import { ParsedFile } from './types';
export declare function parseSpecFile(filePath: string): ParsedFile;
/**
 * Expand any glob patterns in the spec list, then parse every file.
 */
export declare function parseSpecs(specs: string[]): Promise<ParsedFile[]>;
//# sourceMappingURL=parser.d.ts.map