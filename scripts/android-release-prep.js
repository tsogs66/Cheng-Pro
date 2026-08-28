#!/usr/bin/env node
/**
 * Patch Capacitor's generated android/app/build.gradle for CI releases:
 * - versionCode / versionName from package.json
 * - release signing (sideload keystore generated in CI)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + (patch || 0);
const versionName = pkg.version;

const gradlePath = path.join(root, 'android/app/build.gradle');
if (!fs.existsSync(gradlePath)) {
  console.error('Run `npx cap add android` first.');
  process.exit(1);
}

let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);

if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(
    /(\s+buildTypes\s*\{)/,
    `
    signingConfigs {
        release {
            storeFile file('sideload.keystore')
            storePassword System.getenv('CHENGPRO_KEYSTORE_PASS') ?: 'chengpro'
            keyAlias 'chengpro'
            keyPassword System.getenv('CHENGPRO_KEYSTORE_PASS') ?: 'chengpro'
        }
    }$1`
  );
  gradle = gradle.replace(
    /(release\s*\{\s*\n\s*minifyEnabled)/,
    'release {\n            signingConfig signingConfigs.release\n            minifyEnabled'
  );
}

fs.writeFileSync(gradlePath, gradle);

const keystorePath = path.join(root, 'android/app/sideload.keystore');
if (!fs.existsSync(keystorePath)) {
  const pass = process.env.CHENGPRO_KEYSTORE_PASS || 'chengpro';
  execSync(
    [
      'keytool -genkeypair -v',
      '-storetype PKCS12',
      `-keystore "${keystorePath}"`,
      '-alias chengpro',
      '-keyalg RSA -keysize 2048 -validity 10000',
      `-storepass "${pass}"`,
      `-keypass "${pass}"`,
      '-dname "CN=Cheng-Pro, OU=Mobile, O=Cheng-Pro, C=US"',
    ].join(' '),
    { stdio: 'inherit' }
  );
}

console.log(`Android release prep: versionName=${versionName} versionCode=${versionCode}`);
