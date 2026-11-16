import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync, unzipSync } from 'fflate';
import { getDataDir } from '@/lib/db';
import { runSystemCommand } from '@/lib/system/exec';
import { CHMOD_REGEX } from '@/lib/security';
import type { FileEntry } from '@/types/panel';

/**
 * Daftar direktori root yang diizinkan diakses oleh File Manager.
 */
export function getAllowedFileRoots(): string[] {
  const raw = process.env.PANEL_FILE_ROOTS || `${path.join(getDataDir(), 'workspace')},/var/www`;
  const roots = raw
    .split(',')
    .map((s) => path.resolve(s.trim()))
    .filter(Boolean);
  if (roots.length === 0) {
    return [path.resolve(path.join(getDataDir(), 'workspace'))];
  }
  return Array.from(new Set(roots));
}

export function getDefaultFileRoot(): string {
  const roots = getAllowedFileRoots();
  return roots[0];
}

/**
 * Resolusi path dengan proteksi ketat anti path-traversal (../, symlink keluar root).
 */
export async function resolveSafePath(
  inputPath: string,
  mustExist = true
): Promise<{ safePath: string; root: string }> {
  const roots = getAllowedFileRoots();
  const target = path.resolve(inputPath || roots[0]);

  const matchedRoot = roots.find(
    (root) => target === root || target.startsWith(root + path.sep)
  );
  if (!matchedRoot) {
    throw new Error('Akses ditolak: path berada di luar direktori yang diizinkan.');
  }

  if (mustExist) {
    const realTarget = await fs.realpath(target);
    const realRoot = await fs.realpath(matchedRoot).catch(() => matchedRoot);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
      throw new Error('Akses ditolak: symlink mengarah ke luar direktori root.');
    }
    return { safePath: realTarget, root: realRoot };
  }

  // Untuk file baru, pastikan parent directory-nya aman
  const parent = path.dirname(target);
  const realParent = await fs.realpath(parent);
  const realRoot = await fs.realpath(matchedRoot).catch(() => matchedRoot);
  if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
    throw new Error('Akses ditolak: direktori induk berada di luar root.');
  }

  return { safePath: path.join(realParent, path.basename(target)), root: realRoot };
}

function formatOctalMode(mode: number): string {
  return (mode & 0o777).toString(8).padStart(3, '0');
}

export async function listDirectory(dirPath: string): Promise<{
  currentPath: string;
  roots: string[];
  entries: FileEntry[];
}> {
  const roots = getAllowedFileRoots();
  const existingRoots: string[] = [];
  for (const r of roots) {
    try {
      await fs.access(r);
      existingRoots.push(r);
    } catch {
      // Abaikan root yang belum ada di OS saat ini (mis. /var/www di dev)
    }
  }
  const effectiveRoots = existingRoots.length > 0 ? existingRoots : [getDefaultFileRoot()];
  const requested = dirPath || effectiveRoots[0];
  const { safePath } = await resolveSafePath(requested, true);

  const items = await fs.readdir(safePath, { withFileTypes: true });
  const entries: FileEntry[] = [];

  for (const item of items) {
    const full = path.join(safePath, item.name);
    try {
      const stat = await fs.lstat(full);
      entries.push({
        name: item.name,
        path: full,
        type: stat.isDirectory()
          ? 'directory'
          : stat.isSymbolicLink()
            ? 'symlink'
            : 'file',
        size: stat.size,
        mode: formatOctalMode(stat.mode),
        uid: stat.uid,
        gid: stat.gid,
        owner: `${stat.uid}:${stat.gid}`,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch {
      // Lewati entri yang tidak dapat dibaca stat-nya
    }
  }

  entries.sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });

  return { currentPath: safePath, roots: effectiveRoots, entries };
}

export async function readTextFile(filePath: string): Promise<{
  path: string;
  content: string;
  size: number;
}> {
  const { safePath } = await resolveSafePath(filePath, true);
  const stat = await fs.stat(safePath);
  if (stat.isDirectory()) {
    throw new Error('Tidak dapat membaca isi direktori sebagai teks.');
  }
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error('Berkas terlalu besar untuk editor (> 2 MB). Silakan unduh berkas.');
  }
  const content = await fs.readFile(safePath, 'utf8');
  return { path: safePath, content, size: stat.size };
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  const { safePath } = await resolveSafePath(filePath, false);
  await fs.writeFile(safePath, content, 'utf8');
}

export async function createFileOrDir(
  parentPath: string,
  name: string,
  kind: 'file' | 'directory'
): Promise<string> {
  if (!name || name.includes('/') || name.includes('\\') || name === '..' || name === '.') {
    throw new Error('Nama berkas atau folder tidak valid.');
  }
  const target = path.join(parentPath, name);
  const { safePath } = await resolveSafePath(target, false);
  if (kind === 'directory') {
    await fs.mkdir(safePath, { recursive: false });
  } else {
    await fs.writeFile(safePath, '', { flag: 'wx' });
  }
  return safePath;
}

export async function renameEntry(oldPath: string, newName: string): Promise<string> {
  if (!newName || newName.includes('/') || newName.includes('\\') || newName === '..') {
    throw new Error('Nama baru tidak valid.');
  }
  const { safePath } = await resolveSafePath(oldPath, true);
  const dest = path.join(path.dirname(safePath), newName);
  const { safePath: safeDest } = await resolveSafePath(dest, false);
  await fs.rename(safePath, safeDest);
  return safeDest;
}

export async function deleteEntry(targetPath: string): Promise<void> {
  const { safePath, root } = await resolveSafePath(targetPath, true);
  if (safePath === root) {
    throw new Error('Direktori root tidak boleh dihapus.');
  }
  await fs.rm(safePath, { recursive: true, force: false });
}

export async function chmodEntry(targetPath: string, mode: string): Promise<void> {
  if (!CHMOD_REGEX.test(mode)) {
    throw new Error('Mode izin tidak valid (gunakan oktal seperti 755 atau 644).');
  }
  const { safePath } = await resolveSafePath(targetPath, true);
  await fs.chmod(safePath, parseInt(mode, 8));
}

export async function chownEntry(
  targetPath: string,
  owner: string,
  group?: string
): Promise<{ ok: boolean; message: string }> {
  const ownerSpec = group ? `${owner}:${group}` : owner;
  if (!/^[a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.-]+)?$/.test(ownerSpec)) {
    throw new Error('Format owner/group tidak valid.');
  }
  const { safePath } = await resolveSafePath(targetPath, true);
  const res = await runSystemCommand('chown', [ownerSpec, safePath]);
  if (!res.ok) {
    return { ok: false, message: res.stderr };
  }
  return { ok: true, message: `Kepemilikan diubah menjadi ${ownerSpec}` };
}

/**
 * Kompres berkas atau folder menjadi arsip ZIP menggunakan fflate (ringan, tanpa proses eksternal).
 */
export async function zipPath(targetPath: string, archiveName?: string): Promise<string> {
  const { safePath } = await resolveSafePath(targetPath, true);
  const baseName = path.basename(safePath);
  const zipFileName = archiveName?.endsWith('.zip')
    ? archiveName
    : `${archiveName || baseName}.zip`;
  const destZip = path.join(path.dirname(safePath), path.basename(zipFileName));
  const { safePath: safeDest } = await resolveSafePath(destZip, false);

  const filesMap: Record<string, Uint8Array> = {};

  async function walk(current: string, prefix: string) {
    const stat = await fs.stat(current);
    if (stat.isDirectory()) {
      const children = await fs.readdir(current);
      for (const child of children) {
        await walk(path.join(current, child), prefix ? `${prefix}/${child}` : child);
      }
    } else {
      const data = await fs.readFile(current);
      filesMap[prefix || path.basename(current)] = new Uint8Array(data);
    }
  }

  await walk(safePath, baseName);
  const zipped = zipSync(filesMap, { level: 6 });
  await fs.writeFile(safeDest, zipped);
  return safeDest;
}

/**
 * Ekstrak arsip ZIP dengan proteksi Zip-Slip (mencegah path traversal dari dalam arsip).
 */
export async function unzipArchive(archivePath: string): Promise<string> {
  const { safePath } = await resolveSafePath(archivePath, true);
  const buf = await fs.readFile(safePath);
  const entries = unzipSync(new Uint8Array(buf));
  const extractDir = path.dirname(safePath);

  for (const [entryName, data] of Object.entries(entries)) {
    if (!entryName || entryName.endsWith('/')) {
      const dirTarget = path.resolve(extractDir, entryName);
      if (!dirTarget.startsWith(extractDir + path.sep) && dirTarget !== extractDir) {
        throw new Error('Zip-Slip terdeteksi pada arsip.');
      }
      await fs.mkdir(dirTarget, { recursive: true });
      continue;
    }
    const fileTarget = path.resolve(extractDir, entryName);
    if (!fileTarget.startsWith(extractDir + path.sep)) {
      throw new Error('Zip-Slip terdeteksi pada arsip.');
    }
    await fs.mkdir(path.dirname(fileTarget), { recursive: true });
    await fs.writeFile(fileTarget, data);
  }

  return extractDir;
}
