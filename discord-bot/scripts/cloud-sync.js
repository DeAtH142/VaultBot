#!/usr/bin/env node
// scripts/cloud-sync.js
// data/ klasörünü Firestore'a gönderir veya Firestore'dan indirir.
// Kullanım: node scripts/cloud-sync.js pull   (Firestore -> data/)
//           node scripts/cloud-sync.js push   (data/ -> Firestore)
// Env: FIREBASE_SERVICE_ACCOUNT zorunlu.

import process from 'node:process';
import { pullFromCloud, pushToCloud, isCloudEnabled } from '../src/utils/cloudStore.js';

const mode = process.argv[2];

if (!isCloudEnabled()) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT ortam değişkeni ayarlanmamış.');
  process.exit(1);
}

try {
  if (mode === 'pull') {
    await pullFromCloud();
  } else if (mode === 'push') {
    await pushToCloud();
  } else {
    console.error('Kullanım: node scripts/cloud-sync.js [pull|push]');
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error('❌ Cloud sync hatası:', err);
  process.exit(1);
}
