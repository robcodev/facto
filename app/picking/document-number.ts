export function parsePickingDocumentNumber(value: string): string | null {
    const match = value.trim().match(/^#?(\d+)$/);
    return match ? match[1] : null;
}
