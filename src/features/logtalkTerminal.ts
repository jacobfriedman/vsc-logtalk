"use strict";

import { Terminal, window, workspace, TextDocument, Disposable, OutputChannel, Uri, ExtensionContext } from "vscode";
import * as path from "path";
import * as jsesc from "jsesc";
import * as cp from "child_process";
import * as fs from "fs";
import { spawn } from "process-promises";
import LogtalkLinter from "./logtalkLinter";
import { isFunction } from "util";


export default class LogtalkTerminal {
  private static _context: ExtensionContext;
  private static _messageProcess;
  private static _terminal: Terminal;
  private static _testerExec: string;
  private static _testerArgs: string[];
  private static _docletExec: string;
  private static _docletArgs: string[];
  private static _docExec: string;
  private static _docArgs: string[];
  private static _graphvizExec: string;
  private static _graphvizArgs: string[];
  private static _graphvizExt: string[];
  private static _outputChannel: OutputChannel;

  constructor() {

  }

  public static init(context: ExtensionContext): Disposable {

    LogtalkTerminal._context = context;
    LogtalkTerminal._messageProcess = {}

    let section = workspace.getConfiguration("logtalk");
    LogtalkTerminal._testerExec =   section.get<string>("tester.script", "logtalk_tester");
    LogtalkTerminal._outputChannel = window.createOutputChannel("Logtalk Testers & Doclets");
    LogtalkTerminal._testerArgs =   section.get<string[]>("tester.arguments");
    LogtalkTerminal._docletExec =   section.get<string>("doclet.script", "logtalk_doclet" );
    LogtalkTerminal._docletArgs =   section.get<string[]>("doclet.arguments");
    LogtalkTerminal._docExec =      section.get<string>("documentation.script", "lgt2html");
    LogtalkTerminal._docArgs =      section.get<string[]>("documentation.arguments");
    LogtalkTerminal._graphvizExec = section.get<string>("graphviz.executable", "dot");
    LogtalkTerminal._graphvizArgs = section.get<string[]>("graphviz.arguments");
    LogtalkTerminal._graphvizExt =  section.get<string[]>("graphviz.extension");

    return (<any>window).onDidCloseTerminal(terminal => {
        LogtalkTerminal._terminal = null;
        terminal.dispose();
        LogtalkTerminal._messageProcess.kill('SIGHUP');
    });
  }

  private static createLogtalkTerm() {
    if (LogtalkTerminal._terminal) {
      return;
    }

    let section = workspace.getConfiguration("logtalk");
    if (section) {

      let pathLogtalkHome         = jsesc(section.get<string>("home.path", "logtalk")),
          pathLogtalkMessageFile  = `'${pathLogtalkHome}/coding/vscode/.messages'`;

      fs.unlink(pathLogtalkMessageFile, (error) => {
        if (error) { 
          return new Error(`Could not remove the logtalk message file ${pathLogtalkMessageFile}.`);
        } else {
          fs.writeFile(`${pathLogtalkMessageFile}`, '', (error) => {
            if(error) {
              return new Error(`Could not create the logtalk message file ${pathLogtalkMessageFile}.`)
            } else {

              LogtalkTerminal._messageProcess = cp.spawn(`tail -f ${pathLogtalkMessageFile}`);

              LogtalkTerminal._messageProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
              });

              let executable = jsesc(section.get<string>("executable.path", "logtalk"));
              let args = section.get<string[]>("terminal.runtimeArgs");
              LogtalkTerminal._terminal = (<any>window).createTerminal(
                "Logtalk",
                executable,
                args
              );
              let goals = `logtalk_load(coding('vscode/vscode_message_streamer.lgt')).\r`;
              LogtalkTerminal.sendString(goals, false);

            }
          })
        }      
       

      })


    } else {
      throw new Error("configuration settings error: logtalk");
    }
  }

  public static sendString(text: string, addNewLine = false) {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._terminal.sendText(text, addNewLine);
    LogtalkTerminal._terminal.show(false);
  }

  public static openLogtalk() {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal._terminal.show(true);
  }

  public static async loadDocument(uri: Uri, linter: LogtalkLinter) {
    
    const file: string = await LogtalkTerminal.ensureFile(uri);
    let working_directory: string = path.dirname(uri.fsPath);
    await workspace.openTextDocument(uri);
    let logtalkHome: string = '';
    let section = workspace.getConfiguration("logtalk");
    if (section) {
        logtalkHome = jsesc(section.get<string>("home.path", "logtalk"));
    } else {
        throw new Error("configuration settings error: logtalk");
    }

    // await workspace.openTextDocument(uri).then(
    //     (textDocument: TextDocument) => {
    //         linter.doPlint(textDocument, LogtalkTerminal.sendString)
    //     });
    
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.sendString(`logtalk_load('${file}').\r`, false);
 
    // LogtalkTerminal.spawnScript(
    //     ["logtalk_load", "logtalk.document.load", LogtalkTerminal._testerExec],
    //     LogtalkTerminal._testerExec,
    //     LogtalkTerminal._testerArgs
    //   );
  }

  public static async make(uri: Uri) {
    const file: string = await LogtalkTerminal.ensureFile(uri);
    LogtalkTerminal.createLogtalkTerm();
    let goals = `logtalk_make.\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runTests(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    let dir: string;
    dir = path.dirname(uri.fsPath);
    const testfile = path.join(dir, "tester");
    let goals = `logtalk_load('${testfile}').\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runDoclet(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    let dir: string;
    dir = path.dirname(uri.fsPath);
    const docfile = path.join(dir, "doclet");
    let goals = `logtalk_load(doclet(loader)),logtalk_load('${docfile}').\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static async genDocumentation(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    let dir: string = LogtalkTerminal.ensureDir(uri);
    let file: string = await LogtalkTerminal.ensureFile(uri);
    const xmlDir = path.join(dir, "xml_docs");
    let goals = `logtalk_load(lgtdoc(loader)),logtalk_load('${file}'),os::change_directory('${dir}'),lgtdoc::directory('${dir}').\r`;
    LogtalkTerminal.sendString(goals);
    cp.execSync(
      `${LogtalkTerminal._docExec} ${LogtalkTerminal._docArgs.join(
        " "
      )} && code index.html`,
      { cwd: xmlDir }
    );
  }

  public static async genDiagrams(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    let dir: string = LogtalkTerminal.ensureDir(uri);
    let file: string = await LogtalkTerminal.ensureFile(uri);
    let goals = `logtalk_load(diagrams(loader)),logtalk_load('${file}'),os::change_directory('${dir}'),diagrams::directory('${dir}').\r`;
    LogtalkTerminal.sendString(goals);
    cp.execSync(
      `for f in *.dot; do ${LogtalkTerminal._graphvizExec} ${LogtalkTerminal._graphvizArgs.join(
        " "
      )} "$f" > "$(basename "$f" .dot).${LogtalkTerminal._graphvizExt}" || continue; done`,
      { cwd: dir }
    );
  }

  public static async scanForDeadCode(uri: Uri) {
    LogtalkTerminal.createLogtalkTerm();
    const file: string = await LogtalkTerminal.ensureFile(uri);
    let goals = `set_logtalk_flag(report, warnings),logtalk_load('${file}'),flush_output,logtalk_load(dead_code_scanner(loader)),dead_code_scanner::all.\r`;
    LogtalkTerminal.sendString(goals);
  }

  public static runTesters() {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.spawnScript(
      ["logtalk_tester", "logtalk.run.tester", LogtalkTerminal._testerExec],
      LogtalkTerminal._testerExec,
      LogtalkTerminal._testerArgs
    );
  }

  private static spawnScript(type: string[], path: string, args: string[]) {
    let dir: string;
    dir = workspace.rootPath;
    let pp = spawn(path, args, { cwd: dir })
      .on("stdout", out => {
        LogtalkTerminal._outputChannel.append(out + "\n");
        LogtalkTerminal._outputChannel.show(true);
      })
      .on("stderr", err => {
        LogtalkTerminal._outputChannel.append(err + "\n");
        LogtalkTerminal._outputChannel.show(true);
      })
      .catch(error => {
        let message: string = null;
        if ((<any>error).code === "ENOENT") {
          message = `Cannot run the ${type[0]} script. The script was not found. Use the '${type[1]}' setting to configure`;
        } else {
          message = error.message
            ? error.message
            : `Failed to run the script ${type[0]} using path: ${type[2]}. Reason is unknown.`;
        }
        this._outputChannel.append(message);
        this._outputChannel.show(true);
      });
  }
  
  public static runDoclets() {
    LogtalkTerminal.createLogtalkTerm();
    LogtalkTerminal.spawnScript(
      ["logtalk_doclet", "logtalk.run.doclets", LogtalkTerminal._docletExec],
      LogtalkTerminal._docletExec,
      LogtalkTerminal._docletArgs
    );
  }

  private static async ensureFile(uri: Uri): Promise<string> {
    let file: string;
    let doc: TextDocument;

    if (uri && uri.fsPath) {
      doc = workspace.textDocuments.find(txtDoc => {
        return txtDoc.uri.fsPath === uri.fsPath;
      });
      if (!doc) {
        doc = await workspace.openTextDocument(uri);
      }
    } else {
      doc = window.activeTextEditor.document;
    }
    await doc.save();
    return await doc.fileName;
  }

  private static ensureDir(uri: Uri): string {
    let dir: string;
    if (uri && uri.fsPath) {
      dir = path.dirname(uri.fsPath);
    } else {
      dir = workspace.rootPath;
    }
    return dir;
  }
}


