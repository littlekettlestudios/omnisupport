import { execFile } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ScreenRect } from '@shared/bubble';

export class CaptureError extends Error {}

/**
 * Capture a screen rectangle (in screen points) with the native `screencapture`.
 * The PNG is read into memory and the temp file removed immediately; nothing else
 * is written to disk. Needs the Screen Recording permission for this app.
 */
export async function captureRegion(rect: ScreenRect): Promise<Buffer> {
  const file = join(tmpdir(), `clippet-${randomUUID()}.png`);
  const r = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
  await new Promise<void>((resolve, reject) => {
    execFile('screencapture', ['-x', '-R', `${r.x},${r.y},${r.w},${r.h}`, '-t', 'png', file], (err) => (err ? reject(err) : resolve()));
  }).catch((e: Error) => { throw new CaptureError(`screencapture failed: ${e.message}`); });
  try {
    const png = await readFile(file);
    if (png.length < 100) throw new CaptureError('Empty capture. Grant Screen Recording to this app in System Settings → Privacy & Security.');
    return png;
  } catch (e) {
    if (e instanceof CaptureError) throw e;
    throw new CaptureError('No capture produced. Grant Screen Recording to this app in System Settings → Privacy & Security.');
  } finally {
    await unlink(file).catch(() => {});
  }
}
