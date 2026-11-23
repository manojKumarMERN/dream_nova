import type { AppDefinition } from '@nova/spec';

export function modelName(definition: AppDefinition, modelId: string): string {
  return definition.dataModels.find((model) => model.id === modelId)?.name ?? modelId;
}

export function formatValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const escape = (value: unknown) => {
    const text = formatValue(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
