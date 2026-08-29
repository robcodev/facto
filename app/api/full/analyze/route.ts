import readExcelFile from 'read-excel-file/node';
import { parseFullSalesRows } from '@/app/full/parser';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!(file instanceof File)) {
            return Response.json({ error: 'Debes seleccionar un archivo Excel.' }, { status: 400 });
        }

        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            return Response.json({ error: 'El reporte debe estar en formato .xlsx.' }, { status: 400 });
        }

        if (file.size === 0 || file.size > MAX_FILE_SIZE) {
            return Response.json({ error: 'El archivo debe pesar entre 1 byte y 5 MB.' }, { status: 400 });
        }

        const sheets = await readExcelFile(Buffer.from(await file.arrayBuffer()));
        const salesSheet = sheets.find(({ sheet }) => sheet.toLocaleLowerCase('es-CL').includes('ventas')) ?? sheets[0];
        if (!salesSheet) throw new Error('El archivo Excel no contiene pestañas.');
        const analysis = parseFullSalesRows(salesSheet.data, salesSheet.sheet);
        return Response.json(analysis);
    } catch (error) {
        console.error('Error analizando reporte Full:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'No pudimos analizar el reporte.' },
            { status: 500 }
        );
    }
}
