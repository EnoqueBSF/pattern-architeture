export async function exportDiagram(source: string, format: 'svg' | 'png', filename: string): Promise<void> {
  const res = await fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, format, filename }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { issues?: { message: string }[] } | null;
    const detail = body?.issues?.map((i) => i.message).join('; ');
    throw new Error(detail ? `Diagrama invalido: ${detail}` : `Falha ao exportar (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
