export interface LabelConfig {
    widthMm: number;
    heightMm: number;
    contentScalePercent: number;
    zplRaw: string;
}

export interface RenderLabelRequest {
    zpl: string;
    widthMm: number;
    heightMm: number;
    contentScalePercent: number;
}

export interface RenderLabelError {
    error: string;
}

export interface ZplDocumentSummary {
    definitionCount: number;
    totalLabelCount: number;
    batchCount: number;
}
