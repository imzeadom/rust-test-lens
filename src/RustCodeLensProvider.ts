'use strict';
import {
    CancellationToken, CodeLens, CodeLensProvider, Event, EventEmitter,
    Range, TextDocument, DebugConfiguration
} from 'vscode';
import { RustTests } from './RustTests';
import { basename, dirname } from 'path';

export class RustCodeLensProvider implements CodeLensProvider {

    constructor(private _onDidChange: EventEmitter<void>,
        private rustTests: RustTests) {
    }

    get onDidChangeCodeLenses(): Event<void> {
        return this._onDidChange.event;
    }

    public async provideCodeLenses(doc: TextDocument,
        token: CancellationToken): Promise<CodeLens[]> {
        if (token.isCancellationRequested) {
            return [];
        }

        let lenses: CodeLens[] = this.testMethodLenses(doc);
        lenses.push(...this.mainMethodLenses(doc));
        return lenses;
    }

    private mainMethodLenses(doc: TextDocument): any {
        const text = doc.getText();
        const reFnMain = /fn\s+(main)\s*\(\s*\)/g;
        const match = reFnMain.exec(text);
        let lenses: CodeLens[] = [];
        if (match !== null) {
            const codelens = this.makeLens(reFnMain.lastIndex, match[1], doc);
            if (codelens !== undefined) {
                lenses.push(codelens);
            }
        }
        return lenses;
    }

    private testMethodLenses(doc: TextDocument) {
        const text = doc.getText();
        const reTest = /#\[test\]/g;
        const reFnTest = /fn\s+(.+)\s*\(\s*\)/g;
        let lenses: CodeLens[] = [];
        while (reTest.exec(text) !== null) {
            reFnTest.lastIndex = reTest.lastIndex;
            const match = reFnTest.exec(text);
            const fn = match === null ? null : match[1];
            if (fn) {
                const codelens = this.makeLens(reFnTest.lastIndex, fn, doc);
                if (codelens !== undefined) {
                    lenses.push(codelens);
                }
            }
        }
        return lenses;
    }

    private makeLens(index: number, fn: string, doc: TextDocument) {
        const startIdx = index - fn.length;
        const start = doc.positionAt(startIdx);
        const end = doc.positionAt(index);
        const range = new Range(start, end);
        const debugConfig = this.createDebugConfig(fn, doc.fileName);
        if (debugConfig) {
            return new CodeLens(range, {
                title: 'Debug',
                command: "extension.debugTest",
                tooltip: 'Debug',
                arguments: [debugConfig]
            });
        }
    }

    createDebugConfig(fn: string, uri: string): DebugConfiguration | undefined {
        const pkg = this.rustTests.getPackage(fn, uri);
        if (pkg) {
            const args = fn === "main"
                ? [
                    "build",
                    `--package=${pkg.name}`
                ]
                : [
                    "test",
                    "--no-run",
                    `--package=${pkg.name}`
                ];
            const debugConfig = {
                type: "lldb",
                request: "launch",
                name: `Debug ${fn} in ${basename(uri)}`,
                cargo: {
                    args: args,
                    filter: {} as any,
                },
                args: [fn],
                cwd: `${dirname(pkg.manifest_path)}`
            };
            const bin = this.rustTests.getBin(uri, pkg);
            if (bin !== undefined) {
                debugConfig.cargo.args.push(`--bin=${bin}`);
            }
            const kind = this.rustTests.getKind(uri, pkg);
            if (kind !== undefined) {
                debugConfig.cargo.filter.kind = kind;
            }

            return debugConfig;
        }
    }
}