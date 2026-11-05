const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync, execFileSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const port = 3001;
const startupTimeoutMs = 20000;
const retryDelayMs = 250;

function ensurePostgresRunning() {
  if (process.platform !== 'win32') return;
  try {
    const outNet = execSync('netstat -ano | findstr :5432', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (outNet && outNet.includes('LISTENING')) return;
  } catch (_) {}

  try {
    const pgBase = path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'PostgreSQL');
    if (!fs.existsSync(pgBase)) return;
    const versions = fs.readdirSync(pgBase).sort((a, b) => Number(b) - Number(a));
    for (const ver of versions) {
      const pgCtl = path.join(pgBase, ver, 'bin', 'pg_ctl.exe');
      const dataDir = path.join(pgBase, ver, 'data');
      if (fs.existsSync(pgCtl) && fs.existsSync(dataDir)) {
        try {
          execFileSync(pgCtl, ['start', '-D', dataDir, '-w'], {
            stdio: 'ignore',
            windowsHide: true,
            timeout: 15000,
          });
          return;
        } catch (_) {
          try {
            execSync(`net start postgresql-x64-${ver}`, { stdio: 'ignore', windowsHide: true, timeout: 10000 });
            return;
          } catch (__) {}
        }
      }
    }
  } catch (_) {}
}

function killOldPosInstances() {
  try {
    const cmdNode = 'wmic process where "name=\'node.exe\'" get commandline,processid';
    const outNode = execSync(cmdNode, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const nodeLines = outNode.split('\n');
    for (const line of nodeLines) {
      if (line.toLowerCase().includes('crispy') || line.toLowerCase().includes('basilico') || line.toLowerCase().includes('server/index.js')) {
        const match = line.trim().match(/(\d+)$/);
        if (match && Number(match[1]) !== process.pid) {
          try { execSync(`taskkill /F /PID ${match[1]}`, { stdio: 'ignore' }); } catch (e) {}
        }
      }
    }
  } catch (e) {}

  try {
    const cmdNetstat = 'netstat -ano | findstr :3001';
    const outNetstat = execSync(cmdNetstat, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const netLines = outNetstat.split('\n');
    for (const line of netLines) {
      if (line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && Number(pid) !== process.pid) {
          try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch (e) {}
        }
      }
    }
  } catch (e) {}

  try {
    const cmdTask = 'tasklist /v /fo csv';
    const outTask = execSync(cmdTask, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const taskLines = outTask.split('\n');
    for (const line of taskLines) {
      if (/Crispy Burger POS|Basilico/i.test(line)) {
        const match = line.match(/"([^"]+)","(\d+)"/);
        if (match && match[2] && Number(match[2]) !== process.pid) {
          try { execSync(`taskkill /F /PID ${match[2]}`, { stdio: 'ignore' }); } catch (e) {}
        }
      }
    }
  } catch (e) {}
}

function getConnectionInfo() {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/api/connection-info', timeout: 1000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`El backend respondió con estado ${response.statusCode}.`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error('La respuesta de connection-info no es un JSON válido.'));
        }
      });
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Tiempo de espera agotado al consultar connection-info.'));
    });
  });
}

function ensureNodeModules() {
  const localNm = path.join(rootDir, 'node_modules');
  const siblingNm = path.join(rootDir, '..', 'crispy', 'node_modules');
  if (!fs.existsSync(localNm) && fs.existsSync(siblingNm)) {
    try {
      execSync(`cmd /c mklink /J "${localNm}" "${siblingNm}"`, { stdio: 'ignore' });
    } catch (_) {}
  }
}

function startBackend() {
  ensureNodeModules();
  const siblingNm = path.join(rootDir, '..', 'crispy', 'node_modules');
  const localNm = path.join(rootDir, 'node_modules');
  const nodePath = fs.existsSync(localNm) ? localNm : (fs.existsSync(siblingNm) ? siblingNm : '');

  const env = { ...process.env };
  if (nodePath) {
    env.NODE_PATH = env.NODE_PATH ? `${nodePath};${env.NODE_PATH}` : nodePath;
  }

  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env,
  });
  child.unref();
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function getBrowserCandidates() {
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  return [
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
  ].filter(fileExists);
}

function tryOpenBrowser(command, args) {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      resolve(true);
    } catch {
      resolve(false);
    }
  });
}

async function openPos(backendUrl) {
  const candidates = getBrowserCandidates();
  const args = [`--app=${backendUrl}`];

  for (const candidate of candidates) {
    if (await tryOpenBrowser(candidate, args)) return;
  }

  if (await tryOpenBrowser('cmd.exe', ['/c', 'start', '', backendUrl])) return;
  throw new Error('No se encontró un navegador para abrir Basilico.');
}

async function waitForBackend() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      return await getConnectionInfo();
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new Error('Basilico no pudo iniciar el backend LAN. Revisa PostgreSQL y la conexión de red.');
}

async function launch() {
  // 1. Si el backend ya está activo y respondiendo, abrir directamente el navegador
  try {
    const connectionInfo = await getConnectionInfo();
    console.log('✅ Servidor POS ya activo en:', connectionInfo.backendUrl);
    await openPos(connectionInfo.backendUrl);
    return;
  } catch (err) {
    console.log('El servidor POS no está activo aún. Iniciando...');
  }

  // 2. Asegurar que PostgreSQL esté corriendo antes de iniciar backend
  ensurePostgresRunning();

  // 3. Si no responde, asegurar puerto 3001 e iniciar backend
  killOldPosInstances();
  startBackend();

  // 4. Esperar a que el backend esté listo
  const connectionInfo = await waitForBackend();
  console.log('✅ Servidor POS iniciado en:', connectionInfo.backendUrl);
  await openPos(connectionInfo.backendUrl);
}

launch().catch((error) => {
  console.error('Error al iniciar Basilico:', error.message);
  try {
    const safeMsg = String(error.message || 'Error desconocido').replace(/'/g, '').replace(/"/g, '');
    execSync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${safeMsg}', 'Basilico POS - Error de Inicio', [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)"`, { stdio: 'ignore' });
  } catch (e) {}
  process.exitCode = 1;
});
