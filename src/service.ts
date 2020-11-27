import logger from '@wdio/logger';
import { ChildProcessByStdio, spawn } from 'child_process';
import { createWriteStream, ensureFileSync } from 'fs-extra';
import { join, resolve } from 'path';
import { Readable } from 'stream';
import WebdriverIO, { Config } from 'webdriverio';

const log = logger('winappdriver-service');
const LOG_FILE_NAME = 'winappdriver.log';
const WINAPPDRIVER_BIN = 'c:\\Program Files (x86)\\Windows Application Driver\\WinAppDriver.exe';

export class WinAppDriverLauncher implements WebdriverIO.ServiceInstance {
  args: Array<string>;
  command: string;
  logPath: string;
  process: ChildProcessByStdio<null, Readable, Readable> | null;

  constructor(options: Record<string, any>, capabilities: WebDriver.DesiredCapabilities, config: Config) {
    this.args = options.args || [];
    this.logPath = options.logPath || config.outputDir;
    this.command = options.command;
    this.process = null;
    const isWindows = process.platform === 'win32';
    if (!this.command) {
      this.command = WINAPPDRIVER_BIN;
    }
  }

  async onPrepare(config: Config, capabilities: WebDriver.DesiredCapabilities[]) {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      this.process = await this._startWinAppDriver();

      if (typeof this.logPath === 'string') {
        this._redirectLogStream(this.logPath);
      }
    } else {
      log.info('WinAppDriver-Service is ignored on non-Windows platform');
    }
  }

  onComplete() {
    if (this.process) {
      log.debug(`WinAppDriver (pid: ${process.pid}) is killed`);
      this.process.kill();
    }
  }

  _startWinAppDriver(): Promise<ChildProcessByStdio<null, Readable, Readable> | null> {
    return new Promise((resolve, reject) => {
      log.debug(`spawn CLI process: ${this.command} ${this.args.join(' ')}`);
      let process = spawn(this.command, this.args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let error: string;

      process.stdout.on('data', data => {
        if (data.includes('Windows Application Driver listening for requests')) {
          log.debug(`WinAppriver started with ID: ${process.pid}`);
          resolve(process);
        }
      });

      process.stderr.once('data', err => {
        log.error(err);
      });

      process.once('exit', exitCode => {
        let errorMessage = `CLI exited before timeout (exit code: ${exitCode})`;
        reject(null);
      });
    });
  }

  _redirectLogStream(logPath: string) {
    if (this.process) {
      const absolutePath = resolve(logPath);
      const logFile = join(absolutePath, LOG_FILE_NAME);

      // ensure file & directory exists
      ensureFileSync(logFile);

      log.debug(`WinAppDriver logs written to: ${logFile}`);
      const logStream = createWriteStream(logFile, { flags: 'w' });
      this.process.stdout.pipe(logStream);
      this.process.stderr.pipe(logStream);
    }
  }
}
