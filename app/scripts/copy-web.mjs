// =============================================================
// ゲーム本体（リポジトリのいちばん上のファイル）を app/www にコピーする
// アプリはこの www の中身を表示する。ゲームを直したら、ビルドの前に毎回これを実行する（npm run sync）
// =============================================================
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');   // リポジトリのいちばん上
const www = join(here, '..', 'www');

// アプリに入れるもの（app/ や .git などは入れない）
const ITEMS = ['index.html', 'manifest.webmanifest', 'src', 'assets', 'presets', 'vendor'];

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const name of ITEMS) cpSync(join(root, name), join(www, name), { recursive: true });
console.log('copied to', www);
