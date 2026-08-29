#!/usr/bin/env node
/**
 * Copy Cheng-Pro branding into Capacitor's generated android/ res folders.
 * android/ is gitignored and recreated in CI, so icons must be applied after
 * `npx cap add/sync android`.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const iconSrc = path.join(root, 'branding', 'icon.png');
const splashSrc = path.join(root, 'branding', 'splash.png');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');

if (!fs.existsSync(res)) {
  console.warn('apply-android-icons: android res missing — skip');
  process.exit(0);
}
if (!fs.existsSync(iconSrc)) {
  console.error('apply-android-icons: branding/icon.png missing');
  process.exit(1);
}

const dens = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};
const fg = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

const py = `
from PIL import Image
from pathlib import Path
icon = Image.open(${JSON.stringify(iconSrc)}).convert('RGBA')
res = Path(${JSON.stringify(res)})
dens = ${JSON.stringify(dens)}
fg = ${JSON.stringify(fg)}

def save_rgb(img, path, size):
    out = img.resize((size, size), Image.Resampling.LANCZOS)
    bg = Image.new('RGB', (size, size), (15, 23, 42))
    if out.mode == 'RGBA':
        bg.paste(out, mask=out.split()[-1])
    else:
        bg.paste(out.convert('RGB'))
    path.parent.mkdir(parents=True, exist_ok=True)
    bg.save(path, 'PNG', optimize=True)
    print('wrote', path)

for folder, size in dens.items():
    d = res / folder
    save_rgb(icon, d / 'ic_launcher.png', size)
    save_rgb(icon, d / 'ic_launcher_round.png', size)
for folder, size in fg.items():
    save_rgb(icon, res / folder / 'ic_launcher_foreground.png', size)

splash = Image.open(${JSON.stringify(splashSrc)}).convert('RGB') if Path(${JSON.stringify(splashSrc)}).exists() else None
splash_dirs = [
  'drawable','drawable-port-mdpi','drawable-port-hdpi','drawable-port-xhdpi',
  'drawable-port-xxhdpi','drawable-port-xxxhdpi','drawable-land-mdpi',
  'drawable-land-hdpi','drawable-land-xhdpi','drawable-land-xxhdpi','drawable-land-xxxhdpi'
]
sizes = {
  'drawable': 480, 'drawable-port-mdpi': 320, 'drawable-port-hdpi': 480,
  'drawable-port-xhdpi': 720, 'drawable-port-xxhdpi': 1080, 'drawable-port-xxxhdpi': 1440,
  'drawable-land-mdpi': 320, 'drawable-land-hdpi': 480, 'drawable-land-xhdpi': 720,
  'drawable-land-xxhdpi': 1080, 'drawable-land-xxxhdpi': 1440,
}
for folder in splash_dirs:
    size = sizes[folder]
    canvas = Image.new('RGB', (size, size), (15, 23, 42))
    icon_s = int(size * 0.42)
    ic = icon.resize((icon_s, icon_s), Image.Resampling.LANCZOS).convert('RGB')
    canvas.paste(ic, ((size-icon_s)//2, (size-icon_s)//2))
    out = res / folder / 'splash.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, 'PNG', optimize=True)
    print('wrote', out)
`;

const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0F172A</color>
</resources>
`;
const values = path.join(res, 'values');
fs.mkdirSync(values, { recursive: true });
fs.writeFileSync(path.join(values, 'ic_launcher_background.xml'), bgXml);

execFileSync('python3', ['-c', py], { stdio: 'inherit' });
console.log('apply-android-icons: done');
