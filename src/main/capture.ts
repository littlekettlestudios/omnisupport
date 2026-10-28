import { nativeImage } from 'electron';
import { execFile } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ScreenRect } from '@shared/bubble';

export class CaptureError extends Error {}

/** Where a screenshot came from and its size in pixels, so coordinates on it map back to the screen. */
export interface ImageFrame {
  /** The captured rectangle, in screen points. */
  rect: ScreenRect;
  /** Pixel size of the PNG the model sees. */
  width: number;
  height: number;
  /** 'screen' for a whole-display glance, 'region' for a dragged rectangle. */
  kind: 'screen' | 'region';
}

export interface Shot { png: Buffer; frame: ImageFrame }

/**
 * Longest edge sent to the model. Both backends would shrink anything much bigger on
 * their own, and then the model's pixel coordinates would no longer match ours.
 */
const MAX_EDGE = 1280;

/** Capture a rectangle and scale it to at most MAX_EDGE, recording the frame for pointing. */
export async function captureShot(rect: ScreenRect, kind: ImageFrame['kind']): Promise<Shot> {
  let img = nativeImage.createFromBuffer(await captureRegion(rect));
  const size = img.getSize();
  const k = MAX_EDGE / Math.max(size.width, size.height);
  if (k < 1) img = img.resize({ width: Math.round(size.width * k), height: Math.round(size.height * k), quality: 'best' });
  const { width, height } = img.getSize();
  return { png: img.toPNG(), frame: { rect, width, height, kind } };
}

/** Map a pixel on a shot back to a screen point, or null when it falls outside the image. */
export function frameToScreen(frame: ImageFrame, px: number, py: number): { x: number; y: number } | null {
  if (!(px >= 0 && py >= 0 && px <= frame.width && py <= frame.height)) return null;
  return { x: frame.rect.x + (px * frame.rect.w) / frame.width, y: frame.rect.y + (py * frame.rect.h) / frame.height };
}

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
