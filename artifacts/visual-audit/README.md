# Evidência runtime e visual da ABI v6

Este diretório contém a captura versionada produzida por
`BRAIN_AUDIT_DIR=artifacts/visual-audit npm run audit:runtime` e validada por
`npm run verify:runtime-audit`.

`runtime-audit.json` é a fonte legível por máquina. Seu schema 2 registra:

- commit e versão do produto observados;
- ABI 6, ordem e tamanho dos 34 buffers e quatro hashes independentes;
- replay exato após `reset`, rejeição após `dispose` e replay exato após nova
  inicialização;
- cinco abas, 11 capturas, teclado, contraste, saturação e proveniência;
- preset, contagens, cadência, bytes, memória, draw calls, triângulos, latência e
  ambiente do navegador.

As imagens são evidência de execução e inspeção, não oráculos científicos. A
captura versionada atual usa Chromium headless com SwiftShader. Ela fecha
R08-P2, mas não substitui o baseline em GPU física nem a prova pixel→estado de
R08-P3.
