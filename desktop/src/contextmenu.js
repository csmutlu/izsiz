// Sağ tık menüsü:
//  - Windows: HKCU kayıt defterine "İzsiz ile temizle" / "Clean with Izsiz" komutu (yönetici izni gerekmez).
//  - macOS: ~/Library/Services içine Finder "Hızlı Eylem"i (Automator iş akışı).
import { app } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LABELS = { tr: 'İzsiz ile temizle', en: 'Clean with Izsiz' };
const WIN_KEYS = ['HKCU\\Software\\Classes\\*\\shell\\Izsiz', 'HKCU\\Software\\Classes\\Directory\\shell\\Izsiz'];
const macWorkflow = (label) => path.join(os.homedir(), 'Library', 'Services', `${label}.workflow`);

const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, { windowsHide: true }, (err) => resolve(!err)));

function appLauncherPath() {
  // macOS'ta .app paketinin yolu, Windows'ta .exe yolu
  if (process.platform === 'darwin') {
    const m = /^(.*?\.app)\//.exec(process.execPath);
    return m ? m[1] : process.execPath;
  }
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

export async function contextMenuInstalled() {
  if (process.platform === 'win32') return run('reg', ['query', WIN_KEYS[0]]);
  if (process.platform === 'darwin') return Object.values(LABELS).some((l) => fs.existsSync(macWorkflow(l)));
  return false;
}

export async function installContextMenu(lang = 'en') {
  const label = LABELS[lang] || LABELS.en;
  const exe = appLauncherPath();
  if (process.platform === 'win32') {
    const devArg = app.isPackaged ? '' : ` "${app.getAppPath()}"`;
    for (const key of WIN_KEYS) {
      await run('reg', ['add', key, '/ve', '/d', label, '/f']);
      await run('reg', ['add', key, '/v', 'Icon', '/d', exe, '/f']);
      await run('reg', ['add', key, '/v', 'MultiSelectModel', '/d', 'Player', '/f']);
      await run('reg', ['add', `${key}\\command`, '/ve', '/d', `"${exe}"${devArg} "%1"`, '/f']);
    }
    return;
  }
  if (process.platform === 'darwin') {
    await removeContextMenu(); // dil değiştiyse eski adlı Hızlı Eylem kalmasın
    const dir = path.join(macWorkflow(label), 'Contents');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Info.plist'), infoPlist(label));
    const cmd = app.isPackaged
      ? `open -a "${exe}" "$@"`
      : `"${process.execPath}" "${app.getAppPath()}" "$@" >/dev/null 2>&1 &`;
    fs.writeFileSync(path.join(dir, 'document.wflow'), wflow(cmd));
    await run('/System/Library/CoreServices/pbs', ['-flush']);
  }
}

export async function removeContextMenu() {
  if (process.platform === 'win32') {
    for (const key of WIN_KEYS) await run('reg', ['delete', key, '/f']);
    return;
  }
  if (process.platform === 'darwin') {
    for (const l of Object.values(LABELS)) fs.rmSync(macWorkflow(l), { recursive: true, force: true });
    await run('/System/Library/CoreServices/pbs', ['-flush']);
  }
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function infoPlist(label) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSServices</key>
	<array>
		<dict>
			<key>NSBackgroundColorName</key>
			<string>background</string>
			<key>NSIconName</key>
			<string>NSActionTemplate</string>
			<key>NSMenuItem</key>
			<dict>
				<key>default</key>
				<string>${esc(label)}</string>
			</dict>
			<key>NSMessage</key>
			<string>runWorkflowAsService</string>
			<key>NSRequiredContext</key>
			<dict>
				<key>NSApplicationIdentifier</key>
				<string>com.apple.finder</string>
			</dict>
			<key>NSSendFileTypes</key>
			<array>
				<string>public.item</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
`;
}

function wflow(command) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>528</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>${esc(command)}</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/bash</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>8A3C5E0B-6F7D-4C2B-9E3A-1B2C3D4E5F60</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
				</array>
				<key>OutputUUID</key>
				<string>9B4D6F1C-7A8E-4D3C-8F4B-2C3D4E5F6071</string>
				<key>UUID</key>
				<string>0C5E7A2D-8B9F-4E4D-9A5C-3D4E5F607182</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict/>
				<key>isViewVisible</key>
				<integer>1</integer>
				<key>location</key>
				<string>309.000000:253.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleIDsByPath</key>
		<dict/>
		<key>applicationPaths</key>
		<array/>
		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>15</integer>
		<key>processesInput</key>
		<false/>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<false/>
		<key>systemImageName</key>
		<string>NSActionTemplate</string>
		<key>useAutomaticInputType</key>
		<false/>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>
`;
}
