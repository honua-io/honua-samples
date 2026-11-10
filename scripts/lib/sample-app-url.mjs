export function sampleAppPath(app) {
  const entry = app?.entrypoint ?? 'index.html';
  if (!/^[\w./-]+$/.test(entry) || entry.includes('..')) throw new Error('Unsafe sample entrypoint');
  return entry === 'index.html' ? 'app/' : `app/${entry}`;
}
