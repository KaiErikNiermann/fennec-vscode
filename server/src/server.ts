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
        connection.workspace.onDidChangeWorkspaceFolders((_event) => {
            connection.console.log("Workspace folder change event received.");
        });
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
    connection.console.log("We received a file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
        {
            label: "printf",
            kind: CompletionItemKind.Text,
            data: 1,
        },
    ];
});

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
    if (item.data === 1) {
        item.detail = "int printf ( const char * format, ... );";
        item.documentation = "print formatted data to stdout";
    } 
    return item;
});

connection.onHover((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return null;
    }

    // regex pattern to match on functions
    const pattern = /\s*\b[^()]+\(.*\);?\s*$/g;

    const position = params.position;
    const line = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line + 1, character: 0 },
    });

    // check if line matches regex pattern
    const match = pattern.exec(line);
    if (!match) {
        return null;
    }

    const functionName = match[0].split("(")[0].trim();
    const lines = document.getText().split("\n");
    let functionDefinition = "";
    let funcDefLine = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(functionName)) {
            functionDefinition = lines[i];
            funcDefLine = i;
            functionDefinition = functionDefinition.split("{")[0];
            break;
        }
    }

    let comments = "";
	let inBlockComment = false;
	console.log(`funcDefLine: ${funcDefLine}`);
    const importantLines: string[] = [];
	for (let i = funcDefLine - 1; i >= 0; i--) {
		if (lines[i].includes("//")) {
			console.log(`pushing ${lines[i]}`);
			importantLines.push(lines[i]);
		} else if (lines[i].includes("*/")) {
			inBlockComment = true;
			continue;
		} else if (lines[i].includes("/*")) {
			console.log(`pushing ${lines[i]}`);
			importantLines.push(lines[i]);
			break;
		} 
		if (inBlockComment && !lines[i].includes("*/")) {
			console.log(`pushing ${lines[i]}`);
			importantLines.push(lines[i]);
		} else {
			break;
		}
	}
    
	comments = importantLines.map((line) =>
        line.replace(/\/\//g, "").replace("\*\/", "").replace(/\/\*/g, "").trim()
    ).join("\n");

    const hoverText = getHoverText(functionDefinition, comments);

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

function getHoverText(functionDefinition: string, commentText: string): string | null {
    return ["```c", functionDefinition, "```\n", commentText].join("\n");
}

documents.listen(connection);

connection.listen();
