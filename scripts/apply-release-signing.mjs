#!/usr/bin/env node
/**
 * After `npx expo prebuild`, re-apply release signing so we never fall back
 * to debug.keystore. Safe to run repeatedly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');

if (!fs.existsSync(gradlePath)) {
  console.error('android/app/build.gradle not found — run expo prebuild first');
  process.exit(1);
}

let src = fs.readFileSync(gradlePath, 'utf8');
if (src.includes("rootProject.file(\"../.secrets/keystore.properties\")")) {
  console.log('Release signing already applied');
  process.exit(0);
}

const debugBlock = `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const releaseBlock = `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            def ksPropsFile = rootProject.file("../.secrets/keystore.properties")
            if (!ksPropsFile.exists()) {
                throw new GradleException(
                    "Release keystore missing. Copy keystore.properties.example to .secrets/keystore.properties and generate a PKCS12 keystore."
                )
            }
            def ks = new Properties()
            ksPropsFile.withInputStream { ks.load(it) }
            storeFile rootProject.file("../.secrets/" + ks['storeFile'])
            storePassword ks['storePassword']
            keyAlias ks['keyAlias']
            keyPassword ks['keyPassword']
        }
    }`;

if (!src.includes(debugBlock)) {
  console.error('Could not find default Expo debug signingConfigs block to replace');
  process.exit(1);
}
src = src.replace(debugBlock, releaseBlock);
src = src.replace(
  /release \{[\s\S]*?signingConfig signingConfigs\.debug/,
  (m) => m.replace('signingConfigs.debug', 'signingConfigs.release'),
);
fs.writeFileSync(gradlePath, src);
console.log('Applied release signing to android/app/build.gradle');
