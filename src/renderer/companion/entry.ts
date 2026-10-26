// Picks the companion renderer: the pixel sprite sheets in 2D when the config names an
// atlas, else the 3D model (index.ts). Main reloads the page to switch between them.
const config = await window.clippet.getConfig();

if (config.spritesUrl) {
  try {
    await (await import('./sprites')).start(config);
  } catch (err) {
    console.warn('[companion] sprite sheets did not load, using the 3D model', err);
    await import('./index');
  }
} else {
  await import('./index');
}

export {};
