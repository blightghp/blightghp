# Auditoria · R10-F UI e interação

**Estado:** evidência fechada — **UI-031..037** e **UX-003** estão implementados
e verificados neste registro. R10-F não promove R10-E, a 0.10 ou a baseline 0.8:
R10-H, R10-G e a auditoria agregada R10-P continuam pendentes.

**Escopo deste corte:** acrescentar os modos `guided`, `explorer` e `laboratory`
como estado de apresentação e uma paleta modal que aciona controles já existentes.
O padrão dos modos é `guided`; a abertura, filtragem e navegação da paleta não
criam caminho novo no Worker, no solver ou no snapshot. Cada comando preserva o
escopo do controle que já invoca: vistas, busca, corte, câmera de corte, perfis e
modo permanecem operações de interface/apresentação. O foco anatômico acrescenta
somente um rótulo DOM e uma mutação transitória de parâmetros de materiais já
existentes durante o render; não cria geometria, passe, textura, objeto de cena ou
mensagem ao Worker. O contexto de cada vista acrescenta somente texto DOM
versionado, sem estado científico, preferência ou custo de GPU. O selo de
proveniência é DOM persistente da seleção confirmada, sem novo objeto de cena,
material, passe ou estado científico.

UI-035/036 e UX-003 acrescentam o contrato
`src/presentation-navigation.ts` (schema 1): poses salvas, trilha de escalas e
transições continuam fora de `BrainSettings`, do preset científico, da ABI e das
mensagens do Worker. A continuidade é de orientação e foco entre raízes locais
de apresentação; não afirma zoom físico ou coordenadas anatômicas calibradas.

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
  busca anatômica, cortes, enquadramento/poses de câmera e perfis gráfico e de
  materialidade. Busca, corte, câmera e materialidade só são ofertados a partir
  de Explorador; Guiado não cria atalho oculto para esses controles.
- O diálogo declara `role="dialog"` e `aria-modal`; a busca usa combobox com
  `listbox`, opção ativa e estado de resultados. Uma live region externa anuncia
  abertura, indisponibilidade e resultado do comando, sem depender apenas do
  foco visual.
- UI-033 mantém prévia e confirmação separadas: foco por teclado ou ponteiro
  atualiza o foco efêmero sem mudar `selectionId`; `Enter` ou clique convergem na
  seleção canônica já usada pela árvore, cena e auditoria.
- O rótulo de foco declara nome, ID estável, proveniência visual derivada do
  renderizável direto e nível de evidência do catálogo. O equivalente de teclado
  também anuncia o mesmo conteúdo por live region, e todos os campos são escritos
  por `textContent`.
- `SelectionHighlightController` só considera bindings anatômicos diretos e
  visíveis. Ele ajusta `emissive` ou `rim` de materiais já alocados apenas entre
  `beforeRender` e `afterRender`, restaura o valor original e registra zero
  alocação. Materiais cuja cor codifica estado permanecem intactos e usam o
  equivalente textual.
- O picking vascular agora conserva o objeto e o ponto exatos do raycast para o
  rótulo. Segmentos fundidos/instanciados sem binding direto recebem a ficha
  textual correta, nunca o destaque enganoso do primeiro segmento representativo.
- O callout usa projeção mundo→tela, é ocultado quando não há âncora visível ou em
  captura, não aceita ponteiro, cabe em 390×844 e preserva o equivalente
  preto/branco em alto contraste.
- UI-034 mantém uma fonte de verdade por vista em `src/view-context.ts`. As seis
  vistas declaram modelo pelos IDs `MOD-*` já registrados, unidade, hipótese e
  limite sem promover geometria ou aparência a validade científica.
- O painel semântico `O que estou vendo?` usa `<details>` e `<dl>`, permanece no
  modo Guiado e acompanha a aba ativa. Ao haver seleção anatômica, acrescenta o
  ID, a hipótese (`claim`) e os limites do mesmo catálogo canônico, sempre por
  `textContent` e live region.
- A proveniência persistida da seleção é resolvida a partir do binding direto
  visível ou do hit de cena exato, independentemente de um hover ativo. Não se
  infere a classe de um segmento vascular agregado pelo seu representante.
- UI-037 expõe esse resultado em um selo semântico e *sticky*, fora dos
  `<details>` e do catálogo: nome da seleção, classe visual e nível de evidência
  ficam disponíveis também no modo Guiado e após rolagem do painel em 390×844.
  `STATE`, `TOPOLOGY` e `DECORATION` são sempre texto, não uma pista apenas de
  cor; a ausência de binding direto permanece explicitamente
  `SEM REPRESENTAÇÃO DIRETA` e nunca é convertida em `DECORATION`.
- O selo só lê `selectedAnatomyFocus`: prévia de teclado ou ponteiro não troca a
  sua classe, nível ou nome. A live region do contexto inclui classe e evidência
  quando há foco confirmado.
- UI-035 enquadra apenas o limite visual direto da seleção confirmada. O estado
  anterior da câmera e o elemento de origem ficam em memória efêmera; `Escape`
  os restaura. Não há limite visual inventado para entradas que só têm ficha
  textual, e o botão fica desabilitado nesse caso.
- UI-036 declara quatro pontos de vista salvos (`frontal`, `lateral`,
  `superior`, `oblique`) no contrato de apresentação schema 1. O cubo de
  orientação é SVG/DOM, não objeto WebGL, e a paleta também oferece as poses
  autorizadas no modo Explorador.
- UX-003 materializa a trilha Encéfalo → Região → Coluna → Patch → Neurônio →
  Sinapse. Cada degrau seleciona a entrada canônica e a vista correspondente;
  histórico permite voltar em ordem inversa por `Escape`, devolvendo o foco ao
  degrau de origem. A transição interpola pose/alvo da câmera, tem botão de pulo
  e aplica o enquadramento final sem animação sob `prefers-reduced-motion`.
- As distâncias da trilha são poses legíveis de raízes locais de apresentação,
  não conversão entre escalas científicas. Dessa forma, o movimento preserva
  orientação espacial sem alegar uma continuidade métrica que o modelo não
  publica.
- As auditorias anatômica e vascular escolhem explicitamente o modo Explorador
  antes de validar árvore, busca e topologia. Assim, testam o caminho autorizado
  pela UI-031 em vez de depender do modo Guiado padrão; seus subprocessos Git usam
  a exceção local `safe.directory`, sem alterar a configuração global do usuário.
- Em `390×844`, os dois painéis laterais deixam de se sobrepor: o bottom sheet
  alterna explicitamente entre `LEITURA DA VISTA` e `CONTEXTO & NAVEGAÇÃO`.
  Os dois botões têm nome, `aria-pressed`, `aria-controls` e anúncio por live
  region; a superfície inativa sai da árvore visual/acessível, mas permanece
  alcançável pela alternância. A trilha, abas, paleta, sumários, pontos de vista,
  enquadramento e árvore recebem alvo de toque de pelo menos 44 CSS px.
- `scripts/verify_r10_f_accessibility.js` usa Chromium com touch, viewport
  `390×844` e `prefers-reduced-motion: reduce`. Ele toca a alternância, paleta,
  ponto de vista, trilha, árvore e enquadramento; consulta a árvore de
  acessibilidade do navegador, confirma foco/announcements e compara os cinco
  hashes em uma segunda passagem com o motor congelado.

## Fronteira de estado

`src/usage-mode.ts` contém somente a política pura de visibilidade e
`src/command-palette.ts` a política pura de catálogo/pesquisa. `main.ts` mantém
`usageMode` fora de `BrainSettings`; a paleta somente encaminha comandos para os
controles canônicos já ligados ao DOM. O controlador de foco recebe o mesmo ID
estável da árvore e do picking, mas não participa de `BrainSettings`, ABI, snapshot
ou Worker. `src/view-context.ts` é conteúdo estático de apresentação; a seleção
acrescenta apenas evidência já presente no catálogo. Não foi criado comando
adicional de Worker, mudança de ABI/snapshot, passe de renderização ou bifurcação
de solver. O mesmo snapshot e motor atendem os três modos. O selo UI-037 não
persiste preferência, não altera `BrainSettings` e não responde ao foco efêmero.
`src/presentation-navigation.ts` aplica a mesma fronteira a câmera, vistas salvas
e escala: as únicas mutações são câmera/DOM/histórico efêmero, e seu relatório no
hook de auditoria declara apenas schema, pose selecionada, degrau e transição.
`mobileSheet` segue a mesma regra: seleciona somente a superfície DOM exposta no
viewport móvel e não persiste nem alcança o motor.

## Evidência executada em 29 de agosto, 1 e 2 de setembro de 2026

| Prova | Resultado |
| :-- | :-- |
| `npm run check` | passou: tipagem, 36 arquivos/182 testes, links, replay, build, Worker/Wasm, navegação de apresentação, promoção 0.8, orçamento, superfície e auditoria de runtime |
| `npm run typecheck` | passou |
| `npm test -- --run` | passou: 36 arquivos, 182 testes, incluindo contrato de navegação, contexto nas seis vistas, picking rico vascular e destaque efêmero |
| `npm run build` | passou; permanece apenas o aviso conhecido de chunk `three-core` acima de 563 kB |
| `npm run test:wasm-browser` | passou: seletor real, UI-031 por `hidden`, foco restaurado, paleta com `Ctrl` e `Cmd`, UI-033, UI-034 em seis vistas e UI-037 persistente em Guiado/contexto fechado, alto contraste, 390×844, material sem alocação e hashes invariantes no mesmo turno JavaScript |
| `npm run audit:anatomy` | passou: 76 entradas, cinco capturas, árvore/seleção/contexto UI-034, selo UI-037 e custo de cena invariantes |
| `npm run audit:vascular` | passou: 42 segmentos, seis capturas, picking/catálogo/contexto UI-034, selo UI-037 direto ou fallback honesto e cinco hashes invariantes |
| `npm run verify:presentation-budget` | passou: schema 1, seis vistas e hashes invariantes |
| `npm run verify:procedural-surface` | passou: hash `7dfdd64207190121`, 5.780/1.500 triângulos e 12 capturas |
| `npm run verify:presentation-navigation` | passou: contrato schema 1, UI-035 com `Escape`/foco, quatro poses, cubo SVG/DOM, UX-003 reversível/pulável, 390×844, movimento reduzido instantâneo e cinco hashes invariantes com motor congelado |
| `npm run verify:r10-f-accessibility` | passou: bottom sheet de 44 px, touch, árvore de acessibilidade, live regions, paleta, seleção, enquadramento, escala e movimento reduzido em `390×844`; cinco hashes invariantes com motor congelado |

O teste de navegador percorre os três modos e comandos representativos no DOM
real — vista, modo, busca, corte, câmera, perfis, foco anatômico e contexto por
vista — e compara os cinco hashes no mesmo turno JavaScript, onde a troca não
entrega controle ao Worker. Para UI-033 ele prova uma estrutura `STATE` por teclado e uma
`TOPOLOGY`/`ILLUSTRATIVE` por ponteiro, confirma que a prévia não seleciona e que o
material temporário não é alocado. Para UI-034 ele percorre as seis abas, confirma
modelo/unidade/hipótese/limite, evidencia a seleção vascular, alto contraste e a
largura móvel. Para UI-037 ele confirma o selo `STATE`/`DIDACTIC`, preserva-o
durante uma prévia, confirma `TOPOLOGY`/`ILLUSTRATIVE`, esconde o catálogo e fecha
o contexto no modo Guiado, percorre o scroll móvel e testa alto contraste. A prova
R10-F adicional cobre a navegação de touch e a árvore de acessibilidade no layout
real de `390×844`; o corte instantâneo sob movimento reduzido, os alvos de 44 px,
o foco devolvido e os cinco hashes invariantes também são verificados.

## Pendências para promoção 0.10

1. R10-H deve provar o pipeline dormente de asset externo sem distribuir asset de
   terceiros; R10-G deve recapturar e sincronizar o GIF no contrato visual estável.
2. R10-P deve agregar desempenho, documentação e todas as auditorias 0.10 antes
   de qualquer decisão de promoção.

## Decisão de integração

O incremento reversível de UI está integrado em `main`, sem custo GPU adicional.
R10-F está fechado como evidência de interação; R10-E permanece pendente de
promoção e R10-H/R10-G/R10-P têm gates explícitos antes da promoção 0.10. Esta
auditoria não promove a baseline 0.8.
