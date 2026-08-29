# Auditoria parcial · R10-F UI e interação

**Estado:** preparação em andamento — **UI-031 · modos de uso** e **UI-032 ·
paleta de comandos** estão implementados neste registro. Não promove R10-F, não
promove R10-E e não altera a baseline 0.8.

**Escopo deste corte:** acrescentar os modos `guided`, `explorer` e `laboratory`
como estado de apresentação e uma paleta modal que aciona controles já existentes.
O padrão dos modos é `guided`; a abertura, filtragem e navegação da paleta não
criam caminho novo no Worker, no solver ou no snapshot. Cada comando preserva o
escopo do controle que já invoca: vistas, busca, corte, câmera de corte, perfis e
modo permanecem operações de interface/apresentação.

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
- O botão do cabeçalho e `Ctrl/Cmd+K` abrem o `<dialog>` nativo da UI-032. `Esc`
  fecha a paleta e devolve o foco ao elemento que a abriu; setas, `Home`, `End`,
  `Enter` e `Tab` permitem percorrer, executar e fechar a lista sem mouse.
- A política pura em `src/command-palette.ts` normaliza acentos, filtra e ordena
  resultados de forma determinística, respeita o modo de uso atual e rejeita IDs
  de comando duplicados. A execução verifica novamente a permissão antes de
  chamar o controle existente.
- A paleta cobre as categorias previstas para UI-032: vistas, mudança de modo,
  busca anatômica, cortes, restauração da câmera de corte e perfis gráfico e de
  materialidade. Busca, corte, câmera de corte e materialidade só são ofertados a
  partir de Explorador; Guiado não cria atalho oculto para esses controles.
- O diálogo declara `role="dialog"` e `aria-modal`; a busca usa combobox com
  `listbox`, opção ativa e estado de resultados. Uma live region externa anuncia
  abertura, indisponibilidade e resultado do comando, sem depender apenas do
  foco visual.

## Fronteira de estado

`src/usage-mode.ts` contém somente a política pura de visibilidade e
`src/command-palette.ts` a política pura de catálogo/pesquisa. `main.ts` mantém
`usageMode` fora de `BrainSettings`; a paleta somente encaminha comandos para os
controles canônicos já ligados ao DOM. Não foi criado comando adicional de Worker,
mudança de ABI/snapshot, passe de renderização ou bifurcação de solver. O mesmo
snapshot e motor atendem os três modos.

## Evidência executada em 29 ago 2026

| Prova | Resultado |
| :-- | :-- |
| `npm run typecheck` | passou |
| `npm test -- --run` | passou: 33 arquivos, 170 testes, incluindo a política pura da paleta |
| `npm run build` | passou; permanece apenas o aviso conhecido de chunk `three-core` acima de 563 kB |
| `npm run test:wasm-browser` | passou: seletor real, UI-031 por `hidden`, foco restaurado, paleta com `Ctrl` e `Cmd`, filtro/seleção por teclado, diálogo em 390×844, comandos autorizados por modo e cinco hashes invariantes no mesmo turno JavaScript |

O teste de navegador percorre os três modos e comandos representativos no DOM
real — vista, modo, busca, corte, câmera e perfis — e compara os cinco hashes no
mesmo turno JavaScript, onde a troca não entrega controle ao Worker. Essa prova é
de fronteira de apresentação; não substitui os futuros testes de toque, leitura de
tela, fluxo completo em movimento reduzido ou as demais entregas de R10-F.

## Pendências para concluir R10-F

1. UI-033/034/037: destaque, "O que estou vendo?" e selo persistente de
   proveniência.
2. UI-035/036 e UX-003: câmera, retorno de foco, pontos de vista e transições de
   escala.
3. Cobertura de toque, leitura de tela e fluxo completo em 390×844/movimento
   reduzido; depois, auditoria agregada com desempenho e documentação coerentes.

## Decisão de integração

Este é um incremento reversível de UI sem custo GPU e fica na branch de trabalho
até a promoção agregada. Não há merge para `main` nesta etapa: R10-E, R10-F e a
promoção R10-P ainda têm gates explícitos pendentes.
