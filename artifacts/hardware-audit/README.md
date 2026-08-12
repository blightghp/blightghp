# Baseline gráfico em GPU física · R08-P3

Este diretório contém a execução de `npm run audit:hardware` no host Windows
registrado em `runtime-audit.json`, usando Chrome e a Intel UHD Graphics 770 via
ANGLE/Direct3D 11. `npm run verify:hardware-audit` rejeita renderizadores de
software, artefatos incompletos, erro pixel→estado fora do envelope, bindings
sem pista não cromática e capturas ausentes.

O baseline é reproduzível pelo contrato e pelo ambiente registrado; os números
não são promessa universal de desempenho. Outros hardwares precisam gerar seu
próprio relatório comparável. O baseline headless/SwiftShader permanece em
`artifacts/visual-audit` para o CI funcional.
