# Agente de impresión Facto

Primer prototipo para enviar comandas ESC/POS en modo RAW a una impresora térmica POS-8360 instalada en Windows.

## Requisitos

- Windows 10 u 11.
- La POS-8360 instalada mediante su controlador.
- La impresora visible en **Impresoras y escáneres**.
- Windows PowerShell 5.1 o PowerShell 7.

## Preparación

1. Copia la carpeta `printer-agent` al computador conectado a la POS-8360.
2. Haz doble clic en `1-listar-impresoras.cmd`.
3. Confirma que la POS-8360 aparezca asociada al puerto `USB001`.
4. Haz doble clic en `2-imprimir-prueba.cmd`.

Los accesos `.cmd` abren PowerShell automáticamente y no requieren asociar los archivos `.ps1` con ninguna aplicación.

Si prefieres usar PowerShell manualmente, lista las impresoras instaladas con:

```powershell
.\FactoPrinterAgent.ps1 -Action list
```

Después puedes copiar `config.example.json` como `config.json`. Si Windows muestra una sola impresora en `USB001`, puedes dejar `printerName` vacío. Si no, escribe allí el nombre exacto.

## Prueba controlada

La siguiente acción imprime una comanda de demostración, un código CODE128 y luego acciona el cortador:

```powershell
.\FactoPrinterAgent.ps1 -Action test
```

También puedes indicar directamente el nombre de Windows:

```powershell
.\FactoPrinterAgent.ps1 -Action test -PrinterName "POS-80"
```

La prueba no consulta Bsale, Supabase ni Facto. Tampoco modifica pedidos. Solamente envía datos RAW a la impresora local seleccionada.

## Próxima etapa

Cuando Facto tenga configurada la cola:

1. Completa `apiBaseUrl` y `deviceToken` en `config.json`.
2. Haz doble clic en `3-iniciar-agente.cmd`.

El agente consultará trabajos cada cinco segundos y sincronizará con Bsale cada 60 segundos. Así puede recuperar pedidos aunque una notificación webhook no llegue o llegue antes de que Bsale publique el checkout. Solo confirmará un trabajo después de enviarlo correctamente a la impresora. El token del dispositivo se guarda únicamente en `config.json`, que está excluido de Git.

## Inicio automático y diagnóstico

Después de comprobar que la impresión funciona, ejecuta una vez `4-instalar-inicio-automatico.cmd`. El agente se iniciará oculto cada vez que el usuario abra su sesión de Windows y se reiniciará si el proceso falla.

El archivo `agent.log` registra la sincronización, impresión y confirmación de cada preventa. Si Facto muestra el agente desconectado, revisa las últimas líneas de ese archivo.

Para quitar el inicio automático, ejecuta `5-quitar-inicio-automatico.cmd`.
