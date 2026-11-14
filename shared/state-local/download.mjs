export function download(filename, contents, format) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([contents], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/geo+json' }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
