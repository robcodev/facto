'use server';

import type { LabelConfig } from './types';

// Punto de extensión para persistir plantillas en una iteración futura.
export async function validateLabelConfig(config: LabelConfig) {
    return {
        valid:
            Boolean(config.zplRaw.trim()) &&
            config.widthMm > 0 &&
            config.heightMm > 0 &&
            config.contentScalePercent > 0,
    };
}
