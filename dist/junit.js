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
exports.mergeJUnitFiles = mergeJUnitFiles;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// @ts-ignore — junit-report-merger ships without types
const junit_report_merger_1 = __importDefault(require("junit-report-merger"));
/**
 * Merge multiple JUnit XML files produced by individual Cypress worker runs
 * into one combined report. We delegate the actual XML wrangling to
 * junit-report-merger since hand-rolling it is a minefield of edge cases.
 */
async function mergeJUnitFiles(inputDir, outputPath) {
    let files;
    try {
        files = fs
            .readdirSync(inputDir)
            .filter((f) => f.endsWith('.xml'))
            .map((f) => path.join(inputDir, f));
    }
    catch {
        return 0;
    }
    if (files.length === 0)
        return 0;
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    await junit_report_merger_1.default.mergeFiles(outputPath, files);
    return files.length;
}
//# sourceMappingURL=junit.js.map