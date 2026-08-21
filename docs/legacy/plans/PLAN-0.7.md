# LEGACY — Plano 0.7 · BRAIN PRO [v. 0.7.0]

> **LEGACY — documento preservado para rastreabilidade histórica. Foi substituído pelo [ROADMAP.md](../../planning/ROADMAP.md) e pelas especificações canônicas. Não deve ser utilizado como instrução vigente de implementação.**

Data de abertura e fechamento: 2026-08-02.

A fase desce do campo populacional para um patch microscópico pequeno e
auditável. Ela não reinterpreta os 1.890 nós legados como células biológicas e
não altera os hashes promovidos da 0.6.

## Contrato de conclusão

| Corte | Entrega | Estado |
| :-- | :-- | :-- |
| 0.7-a | 8 células E + 4 I em AdEx, soma/dendrito, adaptação, SI e passo de 83,3 µs | concluído |
| 0.7-b | AMPA, NMDA, GABA-A e GABA-B com cinéticas e reversões independentes | concluído |
| 0.7-c | `ResolutionMap`, contorno unilateral e composição sem dupla contagem | concluído |
| 0.7-d | ABI v5, Worker, hash e abas Célula/Eletricidade | concluído |
| 0.7-e | replay, convergência, ensemble, qualidade, auditoria visual e release | concluído |

## Decisões

1. O patch executa 200 subpassos por tick macro; LOD e câmera não alteram isso.
2. O campo fornece corrente de contorno, mas o retorno micro→macro permanece
   desligado até existir um gate de estabilidade bilateral.
3. No vértice selecionado, `blend = 1`: a taxa do patch substitui a atividade do
   campo na apresentação, em vez de ser somada.
4. O snapshot publica SI. Conversões para mV, pA e ms vivem apenas na UI.
5. Os hashes da rede, do circuito córtico-talâmico e do patch são independentes.

## Evidência obrigatória

- invariantes finitos, reset, limites de drive e mapa conservativo;
- convergência do primeiro spike sob refinamento do passo;
- receptor rápido/lento separado e ensemble com oito sementes;
- replay exato `cell-patch-v1.json` regenerável pelo exemplo Rust;
- Clippy sem warnings, testes Cargo/Vitest e alvo Wasm;
- Worker real, quatro abas por teclado, contraste, mobile e capturas.

## Fronteira da 0.8

A 0.7 entrega estados receptor-específicos e uma fronteira de snapshot adequada
para a próxima fase. Vesículas, ocupação receptor–ligante, cascatas, plasticidade
de curto prazo e reação–difusão continuam ausentes até seus contratos de
conservação, positividade, calibração e rigidez serem definidos.
