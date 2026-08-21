# Auditoria R08-P3 · gates gráficos reais

**Data:** 12 de agosto de 2026

**Produto:** 0.8.0

**Veredito deste corte:** R08-P3 concluída; R08-P4 foi posteriormente concluída
em [AUDIT_0.8_PROMOTION.md](AUDIT_0.8_PROMOTION.md)

## Escopo

P3 converte os gates de cor e proveniência em provas estruturais e renderizadas,
sem alterar motor, equações, ABI, snapshot ou hashes científicos. O mesmo preset
foi executado no ambiente funcional SwiftShader e em GPU física Intel UHD 770.

## Gates fechados

| Gate | Prova | Resultado |
| :-- | :-- | :-- |
| pixel→estado | plano WebGL 7×7, cinco estados conhecidos, readback RGBA e conversão sRGB→linear | erro máximo `0,00476` em SwiftShader e `0,00169` em Intel; tolerância `0,012` |
| proveniência | travessia de todos os renderables | 76 objetos declarados; zero sem proveniência |
| binding semântico | campo, unidade, transformação e pista não cromática por `STATE` | 72/72 bindings completos |
| redundância concreta | tipos de geometria, proporções E/I, posições, orientação e diâmetro | testes Vitest executáveis |
| monocromia | 5 vistas capturadas sem cor, além de rótulos/medidores | 5 PNGs por backend |
| saturação | leitura dos PNGs coloridos | todas as capturas abaixo do teto `0,025` |
| ABI/apresentação | Sinapse, cinco abas, 34 buffers e quatro hashes | preservados nos dois relatórios |
| GPU física | renderer de software é rejeitado quando solicitado | Intel UHD 770/ANGLE D3D11 confirmada |

## Baselines observados

| Métrica | SwiftShader | Intel UHD 770/D3D11 |
| :-- | --: | --: |
| amostras | 78 | 237 |
| Worker média/p95 | 495,91 / 1.336,40 ms | 6,04 / 13,70 ms |
| frame CPU média/p95 | 284,78 / 1.085,10 ms | 3,57 / 8,10 ms |
| draw calls | 48 | 48 |
| triângulos | 145.778 | 145.778 |
| geometrias/texturas | 69 / 15 | 69 / 15 |
| bytes do snapshot observado | 73.566 | 73.540 |
| heap JS observado | 15.508.719 B | 14.157.646 B |

As diferenças de bytes decorrem da quantidade de sinais no snapshot observado.
Os números são medições, não metas inventadas nem garantia para outro hardware.

## Evidência e reprodução

- funcional/headless: `../../../artifacts/visual-audit/runtime-audit.json`;
- GPU física: `../../../artifacts/hardware-audit/runtime-audit.json`;
- verificação: `npm run verify:runtime-audit` e
  `npm run verify:hardware-audit`;
- testes estruturais: `src/render/render-contract.test.ts`,
  `src/render/visual-encoding.test.ts` e `src/render-layers.test.ts`.

As capturas Sinapse, Eletricidade monocromática e mobile foram inspecionadas
visualmente após a geração. Não houve corte, overflow ou perda do conteúdo
principal observado.

## Limites aceitos

- o baseline físico cobre uma Intel UHD 770 e um driver; outros backends devem
  repetir o relatório;
- o filtro grayscale gera a captura sem cor, enquanto a segurança sem cor vem
  dos bindings e dos testes geométricos, não do filtro isolado;
- R4/R5/R6/R7 do diagnóstico histórico são dívidas de legibilidade/organização
  e desempenho, não achados altos nem quebra dos gates de P3;
- expansão anatômica ou novos modelos permanecem fora de escopo.

Com P1, P2 e P3 concluídas, a candidata seguiu para R08-P4 e foi promovida.
