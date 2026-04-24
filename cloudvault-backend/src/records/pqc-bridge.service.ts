import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class PqcBridgeService {
  private readonly distro = 'Ubuntu';
  private readonly wslProjectDir =
    '/home/refat/projects/pqc_multicloud_chain/part3_storage_chain';

  private shEscape(value: string) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
  }

  private windowsPathToWsl(winPath: string) {
    const normalized = path.resolve(winPath).replace(/\\/g, '/');
    return normalized.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
  }

  private runWslCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log('\n[WSL CMD START]');
      console.log(command);
      console.log('[WSL CMD END]\n');

      const proc = spawn('wsl', ['-d', this.distro, '--', 'bash', '-lc', command], {
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('error', (err) => reject(err));

      proc.on('close', (code) => {
        console.log('[WSL EXIT CODE]', code);
        if (stdout) console.log('[WSL STDOUT]\n' + stdout);
        if (stderr) console.log('[WSL STDERR]\n' + stderr);

        if (code === 0) {
          resolve(stdout.trim());
          return;
        }

        reject(new Error(stderr || stdout || `WSL command failed with code ${code}`));
      });
    });
  }

  async uploadFileFromWindowsPath(winFilePath: string): Promise<string> {
    const wslFilePath = this.windowsPathToWsl(winFilePath);

    const cmd = `
      cd ${this.shEscape(this.wslProjectDir)} &&
      source .venv/bin/activate &&
      export TLS_HOST=127.0.0.1 &&
      export TLS_UPLOAD_PORT=8443 &&
      export TLS_SOCKET_TIMEOUT=30 &&
      export TLS_CA_FILE=${this.shEscape(this.wslProjectDir + '/cert.pem')} &&
      export TLS_CLIENT_CERT=${this.shEscape(this.wslProjectDir + '/cert.pem')} &&
      export TLS_CLIENT_KEY=${this.shEscape(this.wslProjectDir + '/key.pem')} &&
      python bridge_upload.py --file ${this.shEscape(wslFilePath)}
    `;

    try {
      const out = await this.runWslCommand(cmd);
      const lines = out.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      const parsed = JSON.parse(last);

      if (!parsed?.ok || !parsed?.fileId) {
        throw new Error('Missing fileId from Python bridge');
      }

      return String(parsed.fileId);
    } catch (e: any) {
      throw new InternalServerErrorException(`PQC upload failed: ${e.message}`);
    }
  }

  async downloadToWindowsDir(
  modelFileId: string,
  windowsOutDir: string,
): Promise<{ outputPath: string; filename: string }> {
  const wslOutDir = this.windowsPathToWsl(windowsOutDir);

  const cmd = `
    cd ${this.shEscape(this.wslProjectDir)} &&
    source .venv/bin/activate &&
    export TLS_HOST=127.0.0.1 &&
    export TLS_DOWNLOAD_PORT=9443 &&
    export TLS_RETRY_MAX=5 &&
    export TLS_SOCKET_TIMEOUT=30 &&
    export TLS_CA_FILE=${this.shEscape(this.wslProjectDir + '/cert.pem')} &&
    export TLS_CLIENT_CERT=${this.shEscape(this.wslProjectDir + '/cert.pem')} &&
    export TLS_CLIENT_KEY=${this.shEscape(this.wslProjectDir + '/key.pem')} &&
    python bridge_download.py --file-id ${this.shEscape(modelFileId)} --out ${this.shEscape(wslOutDir)}
  `;

  try {
    const out = await this.runWslCommand(cmd);
    const lines = out.split(/\r?\n/).filter(Boolean);
    const last = lines[lines.length - 1];
    const parsed = JSON.parse(last);

    if (!parsed?.ok || !parsed?.outputPath) {
      throw new Error('Missing outputPath from Python bridge');
    }

    const windowsPath = String(parsed.outputPath)
      .replace(/^\/mnt\/([a-z])\//, (_, d) => `${d.toUpperCase()}:\\`)
      .replace(/\//g, '\\');

    return {
      outputPath: windowsPath,
      filename: parsed.filename || 'download.bin',
    };
  } catch (e: any) {
    throw new InternalServerErrorException(`PQC download failed: ${e.message}`);
  }
}
}