/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    CompletionItemKind,
    TextDocumentPositionParams,
    TextDocumentSyncKind,
    InitializeResult,
    Hover,
    MarkupKind,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import { privateEncrypt } from "crypto";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            // Tell the client that this server supports code completion.
            completionProvider: {
                resolveProvider: true,
            },
            hoverProvider: true,
        },
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true,
            },
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {});
    }
});

// The example settings
interface ExampleSettings {
    maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <ExampleSettings>(
            (change.settings.languageServerExample || defaultSettings)
        );
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: "languageServerExample",
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
    // no validation for now
}

connection.onDidChangeWatchedFiles((_change) => {
    // Monitored files have change in VSCode
});

// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
        {
            label: "printf",
            kind: CompletionItemKind.Function,
            data: 1,
        },
        {
            label: "cstdlib.fh", 
            kind: CompletionItemKind.File,
            data: 2,
        }, 
        {
            label: "atoi",
            kind: CompletionItemKind.Function,
            data: 3,
        },
        {
            label: "exit", 
            kind: CompletionItemKind.Function,
            data: 4,
        }, 
        {
            label: "include",
            kind: CompletionItemKind.Keyword,
            data: 5,
        }
    ];
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
        item.detail = "int printf ( const char * format, ... );";
        item.documentation = "print formatted data to stdout";
    } else if (item.data === 2) {
        item.detail = "C standard library funcs";
        item.documentation = "Prototypes for functions present in the C standard library";
    } else if (item.data === 3) {
        item.detail = "int atoi ( const char * str );";
        item.documentation = "convert string to integer";
    } else if (item.data === 4) {
        item.detail = "void exit ( int status );";
        item.documentation = "terminate calling process";
    } else if (item.data === 5) {
        item.detail = "preprocessor keyword";
    }
    return item;
});

const rePatterns = {
    Comments: /((\/\/|\*|\/\\*).*\n)*/gm,
    Define: /#define\s*(\S+)(?:\s+(.*))/gm,
    VarDef: /((?:(\/\/|\*|\/\\*).*\n)*)[^\n]*\b((?:int|float|char|bool)\s*(\w)\s*=\s*(.*);*)/gm,
    Vars: /(\w+\(?(.*)?\)|\w+)(?<!\b(int|float|char|bool))/gm,
    FuncCall: /(\w+)\s*\((.*)\)/gm,
    FuncDef: /((?:(\/\/|\*|\/\\*).*\n)*)((?:int|char|float)\s*(\w+)\s*\((.*)\))/gm
};

function nthOccurenceIndexRange(
    LOCInput: string,
    functionName: string,
    index: number
): [number, number] {
    let matchIndex = 0;
    const functionCall = `${functionName}(`;
    matchIndex = LOCInput.indexOf(functionCall, matchIndex);
    for (let i = 0; i < index; i++) {
        matchIndex = LOCInput.indexOf(functionCall, matchIndex + 1);
    }
    return [matchIndex - 1, matchIndex + functionName.length - 1];
}

connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }

    const position = params.position;
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 },
    });

    const vars = Array.from(line.matchAll(rePatterns.Vars));

    const varUnderCursor = vars
        .map((varContainer) => {
            const varName = varContainer[0];
            const varContainerIndex = varContainer.index ?? -1;
            return {
                varContainer,
                isUnderCursor:
                    varContainerIndex <= position.character && position.character <= varContainerIndex + varName.length,
            };
        })
        .find((varContainer) => varContainer.isUnderCursor)?.varContainer;

    console.log(`varUnderCursor: ${varUnderCursor}`);

    if (!varUnderCursor) {
        return null;
    }

    let varUnderCursorName = varUnderCursor?.[0] ?? "";
    const varUnderCursorFuncCall = Array.from(varUnderCursorName?.matchAll(rePatterns.FuncCall));
    let defsInFile = Array.from(document.getText.toString().matchAll(rePatterns.VarDef));

    if (varUnderCursorFuncCall) {
        console.log(varUnderCursorFuncCall);
        varUnderCursorName = varUnderCursorFuncCall[0][1];
        defsInFile = Array.from(document.getText.toString().matchAll(rePatterns.FuncDef));
    }

    console.log(`varUnderCursorName: ${varUnderCursorName}`);

    const varDefInfo = {
        varDef: "",
        varComments: "",
    };

    defsInFile
        .forEach((varDef) => {
            if (varDef[4] === varUnderCursorName) {
                varDefInfo.varDef = varDef[3];
                varDefInfo.varComments = varDef[1]
                    .replace(/\/\/\s*/g, "")
                    .replace(/\/[*]|[*]\/|[*]/gm, "");
            }
        });

    console.log(`varDefInfo: ${varDefInfo.varDef}`);
    const hoverText = getHoverText(varDefInfo.varDef, varDefInfo.varComments);

    if (hoverText) {
        const hover: Hover = {
            contents: {
                kind: MarkupKind.Markdown,
                value: hoverText,
            },
        };
        return hover;
    }

    return null;
});

function getFuncDef(lines: string[], functionName: string, functionDefinition: string) {
    let funcDefLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(functionName) && lines[i].includes("{")) {
            functionDefinition = lines[i];
            funcDefLine = i;
            functionDefinition = functionDefinition.split("{")[0];
            break;
        }
    }
    return { funcDefLine, functionDefinition };
}

function getFuncDescription(funcDefLine: number, lines: string[], inBlockComment: boolean) {
    const importantLines: string[] = [];
    for (let i = funcDefLine - 1; i >= 0; i--) {
        if (lines[i].includes("//")) {
            importantLines.unshift(lines[i]);
        } else if (lines[i].includes("*/")) {
            inBlockComment = true;
            continue;
        } else if (lines[i].includes("/*")) {
            importantLines.unshift(lines[i]);
            break;
        }
        if (inBlockComment && !lines[i].includes("*/")) {
            importantLines.unshift(lines[i]);
        } else {
            break;
        }
    }
    return importantLines;
}

function getHoverText(functionDefinition: string, commentText: string): string | null {
    return ["```c", functionDefinition, "```\n", commentText].join("\n");
}

documents.listen(connection);

connection.listen();
