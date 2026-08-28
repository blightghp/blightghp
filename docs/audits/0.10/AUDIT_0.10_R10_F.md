# Auditoria parcial · R10-F UI e interação

**Estado:** preparação em andamento — somente **UI-031 · modos de uso** está
implementado neste registro. Não promove R10-F, não promove R10-E e não altera a
baseline 0.8.

**Escopo deste corte:** adicionar os modos `guided`, `explorer` e `laboratory`
como estado de apresentação. O padrão é `guided`; a troca não altera preset,
seed, `dt`, Worker, snapshot, hashes, topologia ou renderização científica.

## Resultado implementado

- O seletor nativo no cabeçalho anuncia a mudança por live region e permanece
  disponível em 390×844.
- Grupos de controle usam `hidden`, não apenas CSS. Guiado mostra leituras e
  navegação essenciais; explorador acrescenta corte, catálogo, topologia vascular,
  foco anatômico e detalhe elétrico; laboratório acrescenta dinâmica, LOD,
  cadência, telemetria e ajustes fotônicos já existentes.
- A ordem é cumulativa e a transição devolve o foco ao seletor se o controle antes
  focado se tornar oculto.
- Atalhos de corte, isolamento e câmera exigem ao menos o modo explorador, para não
  oferecer um caminho oculto a controles suprimidos na interface guiada.
- Os controles de laboratório exibem seus envelopes: tempo de parede, quantidade
  visual, faixa STDP, LOD/cadência e limites de fotônica. Não há seed, replay,
  logs ou exportação fingidos; esses entregáveis continuam pendentes.

## Fronteira de estado

`src/usage-mode.ts` contém somente a política pura de visibilidade. `main.ts`
mantém `usageMode` fora de `BrainSettings` e apenas atualiza atributos e o DOM.
Não há chamada a `sendCommand`, mutação de `state`, renderização adicional ou
mudança de material durante a troca. O mesmo snapshot e motor atendem os três
modos.

## Evidência executada em 28 ago 2026

| Prova | Resultado |
| :-- | :-- |
| `npm run typecheck` | passou |
| `npm test -- --run` | passou: 32 arquivos, 166 testes |
| `npm run build` | passou; permanece apenas o aviso conhecido de chunk `three-core` acima de 563 kB |
| `npm run test:wasm-browser` | passou: seletor real, `hidden` por modo, foco restaurado, teclado nativo, 390×844 e cinco hashes invariantes em troca síncrona |

O teste de navegador percorre os três modos no DOM real e compara os cinco hashes
no mesmo turno JavaScript, onde a troca não entrega controle ao Worker. Essa prova
é de fronteira de apresentação; não substitui os futuros testes de teclado, foco,
toque e movimento reduzido de todo R10-F.

## Pendências para concluir R10-F

1. UI-032: paleta de comandos por teclado com anúncio de resultado.
2. UI-033/034/037: destaque, "O que estou vendo?" e selo persistente de
   proveniência.
3. UI-035/036 e UX-003: câmera, retorno de foco, pontos de vista e transições de
   escala.
4. Cobertura de toque, leitura de tela e fluxo completo em 390×844/movimento
   reduzido; depois, auditoria agregada com desempenho e documentação coerentes.

## Decisão de integração

Este é um incremento reversível de UI sem custo GPU e fica na branch de trabalho
até a promoção agregada. Não há merge para `main` nesta etapa: R10-E, R10-F e a
promoção R10-P ainda têm gates explícitos pendentes.
