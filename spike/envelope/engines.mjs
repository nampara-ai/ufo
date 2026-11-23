// The three engines, wherever this machine keeps them: Playwright's own place, or $HOME/pw-extra (Firefox and WebKit here).
import fs from 'fs'; import os from 'os'; import path from 'path'; import { createRequire } from 'module';
export const playwright = createRequire(import.meta.url)('playwright'), ENGINES = ['chromium', 'firefox', 'webkit'];
export function executable(name) {
  const exe = playwright[name].executablePath(); if (fs.existsSync(exe)) return exe;
  for (const root of [path.join(os.homedir(), 'pw-extra'), '/opt/pw-browsers']) { const m = /[\\/]((?:chromium|firefox|webkit)[^\\/]*-\d+[\\/].*)$/.exec(exe), alt = m && path.join(root, m[1]); if (alt && fs.existsSync(alt)) return alt; }
  return null;
}
export const launch = (name, options = {}) => playwright[name].launch({ executablePath: executable(name), ...options });
