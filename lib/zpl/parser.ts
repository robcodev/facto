export const DOTS_PER_MM = 12;
export const LABELARY_MAX_LABELS_PER_REQUEST = 50;

const LABEL_BLOCK_PATTERN = /\^\s*XA[\s\S]*?\^\s*XZ/gi;

export interface ZplLabelDefinition {
    zpl: string;
    quantity: number;
}

export interface ZplBatch {
    zpl: string;
    labelCount: number;
}

export interface ZplDocumentSummary {
    definitionCount: number;
    totalLabelCount: number;
    batchCount: number;
}

function assertPositiveMillimeters(value: number, field: string) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${field} debe ser un número mayor que cero.`);
    }
}

function insertAfterStart(zpl: string, commands: string) {
    const startMatch = /\^\s*XA/i.exec(zpl);

    if (!startMatch || startMatch.index === undefined) {
        return `^XA\n${commands}\n${zpl.trim()}\n^XZ`;
    }

    const insertionPoint = startMatch.index + startMatch[0].length;
    return `${zpl.slice(0, insertionPoint)}\n${commands}${zpl.slice(insertionPoint)}`;
}

function setNumericCommand(zpl: string, command: 'PW' | 'LL', value: number) {
    const pattern = new RegExp(`\\^\\s*${command}\\s*\\d+`, 'i');
    const replacement = `^${command}${value}`;

    return pattern.test(zpl) ? zpl.replace(pattern, replacement) : insertAfterStart(zpl, replacement);
}

function scaledInteger(value: string, factor: number) {
    return String(Math.round(Number(value) * factor));
}

function scaleCommandArguments(
    zpl: string,
    command: string,
    indexes: number[],
    factor: number,
    limits: Partial<Record<number, { min: number; max: number }>> = {}
) {
    const pattern = new RegExp(`(\\^\\s*${command}\\s*)([^\\^\\r\\n]*)`, 'gi');

    return zpl.replace(pattern, (_match, prefix: string, rawArguments: string) => {
        const argumentsList = rawArguments.split(',');

        for (const index of indexes) {
            const value = argumentsList[index]?.trim();
            if (!value || !/^-?\d+$/.test(value)) continue;

            let scaled = Math.round(Number(value) * factor);
            const limit = limits[index];
            if (limit) scaled = Math.min(limit.max, Math.max(limit.min, scaled));
            argumentsList[index] = String(scaled);
        }

        return `${prefix}${argumentsList.join(',')}`;
    });
}

export function scaleZplContent(zpl: string, scalePercent: number): string {
    if (!Number.isFinite(scalePercent) || scalePercent <= 0) {
        throw new Error('La escala del contenido debe ser mayor que cero.');
    }

    if (scalePercent === 100) return zpl;
    const factor = scalePercent / 100;
    let scaled = zpl;

    // Orígenes y posiciones absolutas.
    scaled = scaled.replace(
        /(\^\s*(?:FO|FT|LH)\s*)(-?\d+)\s*,\s*(-?\d+)/gi,
        (_match, prefix: string, x: string, y: string) =>
            `${prefix}${scaledInteger(x, factor)},${scaledInteger(y, factor)}`
    );

    // Fuentes individuales (^A0N,alto,ancho) y fuente predeterminada (^CF0,alto,ancho).
    scaled = scaled.replace(
        /(\^\s*A[A-Z0-9]\s*[NRIB]?\s*,\s*)(\d+)(?:\s*,\s*(\d+))?/gi,
        (_match, prefix: string, height: string, width?: string) =>
            `${prefix}${scaledInteger(height, factor)}${width ? `,${scaledInteger(width, factor)}` : ''}`
    );
    scaled = scaled.replace(
        /(\^\s*CF[A-Z0-9]?\s*,\s*)(\d+)(?:\s*,\s*(\d+))?/gi,
        (_match, prefix: string, height: string, width?: string) =>
            `${prefix}${scaledInteger(height, factor)}${width ? `,${scaledInteger(width, factor)}` : ''}`
    );

    // Ancho de módulo/altura por defecto, altura de Code 128, bloques de texto y cajas gráficas.
    scaled = scaleCommandArguments(scaled, 'BY', [0, 2], factor, { 0: { min: 1, max: 10 } });
    scaled = scaled.replace(
        /(\^\s*BC\s*[NRIB]?\s*,\s*)(\d+)/gi,
        (_match, prefix: string, height: string) => `${prefix}${scaledInteger(height, factor)}`
    );
    scaled = scaleCommandArguments(scaled, 'FB', [0, 2], factor);
    scaled = scaleCommandArguments(scaled, 'GB', [0, 1, 2], factor);

    return scaled;
}

export function millimetersToDots(mm: number) {
    assertPositiveMillimeters(mm, 'La medida');
    return Math.round(mm * DOTS_PER_MM);
}

function setSingleLabelSize(zpl: string, widthMm: number, heightMm: number) {
    const withWidth = setNumericCommand(zpl, 'PW', millimetersToDots(widthMm));
    return setNumericCommand(withWidth, 'LL', millimetersToDots(heightMm));
}

export function setLabelSize(zpl: string, widthMm: number, heightMm: number): string {
    assertPositiveMillimeters(widthMm, 'El ancho');
    assertPositiveMillimeters(heightMm, 'El alto');

    const blocks = zpl.match(LABEL_BLOCK_PATTERN);
    if (!blocks) return setSingleLabelSize(zpl, widthMm, heightMm);

    let blockIndex = 0;
    return zpl.replace(LABEL_BLOCK_PATTERN, () => setSingleLabelSize(blocks[blockIndex++], widthMm, heightMm));
}

export function getLabelSize(zpl: string): { widthDots: number | null; heightDots: number | null } {
    const width = /\^\s*PW\s*(\d+)/i.exec(zpl);
    const height = /\^\s*LL\s*(\d+)/i.exec(zpl);

    return {
        widthDots: width ? Number(width[1]) : null,
        heightDots: height ? Number(height[1]) : null,
    };
}

function getPrintQuantity(block: string) {
    const match = /\^\s*PQ\s*([+-]?\d*)/i.exec(block);
    if (!match) return 1;

    const quantity = match[1] === '' ? 1 : Number(match[1]);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new Error(`Cantidad ^PQ inválida: ${match[1] || '(vacía)'}.`);
    }

    return quantity;
}

function setPrintQuantity(block: string, quantity: number) {
    const command = /\^\s*PQ\s*[+-]?\d*(\s*(?:,[^\^\r\n]*)?)/i;
    const match = command.exec(block);

    if (match) {
        const remainingParameters = match[1] || ',0,1,Y';
        return block.replace(command, `^PQ${quantity}${remainingParameters}`);
    }

    const end = /\^\s*XZ/i;
    return block.replace(end, `^PQ${quantity},0,1,Y\n^XZ`);
}

export function parseZplLabels(zpl: string): ZplLabelDefinition[] {
    const blocks = zpl.match(LABEL_BLOCK_PATTERN);
    if (!blocks?.length) {
        throw new Error('No se encontraron etiquetas ZPL válidas delimitadas por ^XA y ^XZ.');
    }

    return blocks.map((block) => ({
        zpl: block,
        quantity: getPrintQuantity(block),
    }));
}

export function summarizeZpl(zpl: string, maxLabels = LABELARY_MAX_LABELS_PER_REQUEST): ZplDocumentSummary {
    const definitions = parseZplLabels(zpl);
    const totalLabelCount = definitions.reduce((total, definition) => total + definition.quantity, 0);

    return {
        definitionCount: definitions.length,
        totalLabelCount,
        batchCount: Math.ceil(totalLabelCount / maxLabels),
    };
}

export function splitZplIntoBatches(
    zpl: string,
    maxLabels = LABELARY_MAX_LABELS_PER_REQUEST
): ZplBatch[] {
    if (!Number.isSafeInteger(maxLabels) || maxLabels <= 0) {
        throw new Error('El tamaño máximo del lote debe ser un entero mayor que cero.');
    }

    const definitions = parseZplLabels(zpl);
    const batches: ZplBatch[] = [];
    let currentBlocks: string[] = [];
    let currentCount = 0;

    const finishBatch = () => {
        if (!currentBlocks.length) return;
        batches.push({ zpl: currentBlocks.join('\n'), labelCount: currentCount });
        currentBlocks = [];
        currentCount = 0;
    };

    for (const definition of definitions) {
        let remaining = definition.quantity;

        while (remaining > 0) {
            const available = maxLabels - currentCount;
            const quantityForBatch = Math.min(remaining, available);
            currentBlocks.push(setPrintQuantity(definition.zpl, quantityForBatch));
            currentCount += quantityForBatch;
            remaining -= quantityForBatch;

            if (currentCount === maxLabels) finishBatch();
        }
    }

    finishBatch();
    return batches;
}
