import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const androidResDir = path.join(root, 'android', 'app', 'src', 'main', 'res');
const buildGradlePath = path.join(root, 'android', 'app', 'build.gradle');
const stdIcon = path.join(root, 'public', 'pwa-512x512.png');
const maskableIcon = path.join(root, 'public', 'pwa-maskable-512x512.png');

if (!fs.existsSync(androidResDir)) {
  console.error('Android directory not found. Run `npx cap add android` first.');
  process.exit(1);
}

const densities = [
  { folder: 'mipmap-mdpi', iconSize: 48, fgSize: 108 },
  { folder: 'mipmap-hdpi', iconSize: 72, fgSize: 162 },
  { folder: 'mipmap-xhdpi', iconSize: 96, fgSize: 216 },
  { folder: 'mipmap-xxhdpi', iconSize: 144, fgSize: 324 },
  { folder: 'mipmap-xxxhdpi', iconSize: 192, fgSize: 432 },
];

function hasCommand(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const useConvert = hasCommand('convert');

for (const { folder, iconSize, fgSize } of densities) {
  const dir = path.join(androidResDir, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const launcherDest = path.join(dir, 'ic_launcher.png');
  const roundDest = path.join(dir, 'ic_launcher_round.png');
  const fgDest = path.join(dir, 'ic_launcher_foreground.png');

  if (useConvert && fs.existsSync(stdIcon)) {
    execSync(`convert "${stdIcon}" -resize ${iconSize}x${iconSize} "${launcherDest}"`);
    execSync(`convert "${stdIcon}" -resize ${iconSize}x${iconSize} "${roundDest}"`);
    const fgSource = fs.existsSync(maskableIcon) ? maskableIcon : stdIcon;
    execSync(`convert "${fgSource}" -resize ${fgSize}x${fgSize} "${fgDest}"`);
  } else {
    if (fs.existsSync(stdIcon)) {
      fs.copyFileSync(stdIcon, launcherDest);
      fs.copyFileSync(stdIcon, roundDest);
    }
    const fgSource = fs.existsSync(maskableIcon) ? maskableIcon : stdIcon;
    if (fs.existsSync(fgSource)) {
      fs.copyFileSync(fgSource, fgDest);
    }
  }
}

const bgXmlPath = path.join(androidResDir, 'values', 'ic_launcher_background.xml');
fs.mkdirSync(path.dirname(bgXmlPath), { recursive: true });
fs.writeFileSync(
  bgXmlPath,
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0D5EAF</color>\n</resources>\n`,
  'utf8'
);

const runNumber = Number.parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
if (Number.isFinite(runNumber) && runNumber > 0 && fs.existsSync(buildGradlePath)) {
  let gradle = fs.readFileSync(buildGradlePath, 'utf8');
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${runNumber}`);
  gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "1.0.${runNumber}"`);
  fs.writeFileSync(buildGradlePath, gradle, 'utf8');
}

const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  const requiredTags = [
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  ];
  const missingTags = requiredTags.filter((tag) => !manifest.includes(tag));
  if (missingTags.length > 0 && manifest.includes('<application')) {
    manifest = manifest.replace('<application', `${missingTags.join('\n    ')}\n\n    <application`);
  }

  // Register custom scheme deep-link for Google Sign-In Chrome Custom Tab callback (com.aegea.smartguide://auth)
  if (!manifest.includes('android:scheme="com.aegea.smartguide"') && manifest.includes('</activity>')) {
    const authIntentFilter = `
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="com.aegea.smartguide" android:host="auth" />
            </intent-filter>
        </activity>`;
    manifest = manifest.replace('</activity>', authIntentFilter);
  }

  fs.writeFileSync(manifestPath, manifest, 'utf8');
}

console.log('Configured AEGEA Android icons, camera/mic permissions, auth deep-link, and version code.');
