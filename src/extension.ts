"use strict";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  commands,
  DocumentFilter,
  ExtensionContext,
  languages,
  workspace
} from "vscode";

import { loadEditHelpers } from "./features/editHelpers";
import { Utils } from "./utils/utils";
import LogtalkDocumentHighlightProvider from "./features/documentHighlightProvider";
import LogtalkTerminal from "./features/logtalkTerminal";
import LogtalkLinter from "./features/logtalkLinter";
import LogtalkHoverProvider from "./features/hoverProvider";

const DEBUG = 1;

export function activate(context: ExtensionContext) {

  let subscriptions = context.subscriptions;
  DEBUG ? console.log('Congratulations, your extension "vsc-logtalk" is now active!') : null;

  const LOGTALK_MODE: DocumentFilter = { language: "logtalk", scheme: "file" };

  loadEditHelpers(subscriptions);
  const linter = new LogtalkLinter(context);
  linter.activate(subscriptions);

  DEBUG ? console.log('Linter Loaded.') : null;

  Utils.init(context);

  let logtalkCommands = [
    { command: "logtalk.linter.nextErrLine",     callback: ()   => linter.nextErrLine()},
    { command: "logtalk.linter.prevErrLine",     callback: ()   => linter.prevErrLine()},
    { command: "logtalk.load.document",          callback: uri  => LogtalkTerminal.loadDocument(uri, linter)},
    { command: "logtalk.make",                   callback: async (uri)  => LogtalkTerminal.make(uri)},
    { command: "logtalk.run.tests",              callback: uri  => LogtalkTerminal.runTests(uri)},
    { command: "logtalk.run.doclet",             callback: uri  => LogtalkTerminal.runDoclet(uri)},
    { command: "logtalk.scan.deadCode",          callback: uri  => LogtalkTerminal.scanForDeadCode(uri)},
    { command: "logtalk.generate.documentation", callback: uri  => LogtalkTerminal.genDocumentation(uri)},
    { command: "logtalk.generate.diagrams",      callback: uri  => LogtalkTerminal.genDiagrams(uri)},
    { command: "logtalk.open",                   callback: ()   => LogtalkTerminal.openLogtalk()},
    { command: "logtalk.run.testers",            callback: uri  => LogtalkTerminal.runTesters()},
    { command: "logtalk.run.doclets",            callback: uri  => LogtalkTerminal.runDoclets()}
  ];
  
  logtalkCommands.map(command => {
    context.subscriptions.push(
      commands.registerCommand(command.command, command.callback)
    );
  });

  context.subscriptions.push(
    languages.registerDocumentHighlightProvider(
      LOGTALK_MODE,
      new LogtalkDocumentHighlightProvider()
    )
  );
  context.subscriptions.push(
    languages.registerHoverProvider(LOGTALK_MODE, new LogtalkHoverProvider())
  );
  context.subscriptions.push(LogtalkTerminal.init(context));
}
// this method is called when your extension is deactivated
export function deactivate() {}
