'use client';

import { strToU8, zipSync } from 'fflate';

export type ExcelColumn<Row> = {
    header: string;
    value: (row: Row) => string | number;
    width?: number;
    numberFormat?: 'integer' | 'decimal' | 'percent';
};

function escapeXml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function columnName(index: number) {
    let name = '';
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
        name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
    }
    return name;
}

function safeFileName(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'lista-descuentos';
}

export function downloadExcel<Row>(fileName: string, sheetName: string, rows: Row[], columns: ExcelColumn<Row>[]) {
    const lastColumn = columnName(columns.length - 1);
    const lastRow = rows.length + 1;
    const widths = columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 14}" customWidth="1"/>`).join('');
    const header = columns.map((column, index) => `<c r="${columnName(index)}1" t="inlineStr" s="1"><is><t>${escapeXml(column.header)}</t></is></c>`).join('');
    const body = rows.map((row, rowIndex) => {
        const cells = columns.map((column, columnIndex) => {
            const value = column.value(row);
            const ref = `${columnName(columnIndex)}${rowIndex + 2}`;
            if (typeof value === 'number' && Number.isFinite(value)) {
                const style = column.numberFormat === 'percent' ? 3 : column.numberFormat === 'decimal' ? 4 : column.numberFormat === 'integer' ? 2 : 0;
                const numericValue = column.numberFormat === 'percent' ? value / 100 : value;
                return `<c r="${ref}" s="${style}"><v>${numericValue}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(value ?? ''))}</t></is></c>`;
        }).join('');
        return `<row r="${rowIndex + 2}">${cells}</row>`;
    }).join('');
    const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData><row r="1">${header}</row>${body}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`;
    const files = {
        '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
        '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
        'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
        'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
        'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'),
        'xl/worksheets/sheet1.xml': strToU8(worksheet),
    };
    const blob = new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeFileName(fileName)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
}
