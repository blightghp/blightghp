# Auditoria de prontidão para materialidade 3D · BRAIN PRO 0.9

**Data:** 13 de agosto de 2026

**Baseline funcional:** R09-D concluída · ABI/snapshot 7 · seis vistas

**Escopo:** sincronização documental, captura de perfil, motor web publicado e
preparação técnica para uma futura película `realistic-illustrative` por vista.

## Veredito

A base está **pronta no nível de contrato e inventário** para iniciar a fabricação
gráfica futura. A película realista ainda **não está implementada nem promovida**.
O perfil esquemático continua sendo a referência executável e o fallback
obrigatório.

Não há autorização para atribuir validade anatômica, histológica ou clínica ao
acabamento. Uma vista só poderá receber a película em R09-F depois de cumprir o
manifesto, a inspeção visual, a acessibilidade, o orçamento e a invariância
descritos nesta auditoria e em `GRAPHICS_SPEC.md`.

## Escopo conferido

- seis `RenderLayer`s independentes: Visão Geral, Lâminas, Célula, Neurônio,
  Eletricidade e Sinapse;
- separação executável entre `matter` e `emission`;
- proveniência `STATE`, `TOPOLOGY` ou `DECORATION` por objeto renderizável;
- binding estruturado de todo objeto `STATE` para campo, unidade, transformação
  e pista redundante;
- geometria determinística da vista Neurônio e independência dos cinco hashes;
- captura do perfil e manifesto de proveniência do GIF;
- documentação canônica, README e roadmap vigente.

## Achado corrigido

O simulador já possuía seis vistas, mas a agenda da captura pública ainda
percorria apenas cinco e omitia Neurônio. A agenda passou a ter uma única fonte
canônica de 60 quadros, distribuída entre as seis vistas. O manifesto schema 2
rejeita ausência, excesso ou alocação divergente; testes cobrem explicitamente a
vista `neuron`.

## Inventário por vista

| Vista | Scene graph atual | Base para película | Limite que deve sobreviver ao acabamento | Estado |
| :-- | :-- | :-- | :-- | :-- |
| Visão Geral | pontos, conexões, pulsos, cascas e campo | matéria procedural separada de emissão | não é atlas nem superfície anatômica | contrato pronto |
| Lâminas | L1–L6, vias, relé e TRN | sólidos com normas e formas redundantes | espessuras e massas são didáticas | contrato pronto |
| Célula | 12 somas, dendritos, correntes, contorno e seleção | matéria e sinais com bindings publicados | dendrito único, sem canais detalhados | contrato pronto |
| Neurônio | soma, árvore, axônio, nós, correntes e evento | geometria estável por `seed + cellId` | sem tipo celular, propagação ou mielina funcional | contrato pronto |
| Eletricidade | substrato, grade, nós, vias, V/A/S e eventos | substrato elegível; sinais protegidos | esquema explicativo, não circuito físico | contrato pronto |
| Sinapse | membranas, vesículas, fenda, nuvens e receptores | membranas elegíveis com escala rotulada | microdomínio representativo e exagerado | contrato pronto |

## Contrato executável acrescentado

`auditVisualMaterialReadiness()` inventaria cada árvore visual e informa:

- perfil ativo;
- objetos renderizáveis de matéria e emissão;
- malhas de matéria candidatas a PBR por presença de normais;
- objetos que devem permanecer esquemáticos;
- lacunas de proveniência e de bindings de `STATE`;
- `contractReady`, que só é verdadeiro com árvore não vazia e sem lacunas.

`window.__BRAIN_ENGINE__.materialProfileAudit()` publica o relatório para as
seis vistas no mesmo entry point usado pelo site e pela captura. O relatório é
diagnóstico de prontidão, não seletor de material e não cruza o Worker.

## Gate de fabricação por vista

Cada vista futura deve apresentar, em um commit próprio:

1. lista de objetos elegíveis e protegidos;
2. manifesto de asset/procedural com fonte, licença, versão e hash;
3. escala, orientação, transformação, UV, normal, tangente e espaço de cor;
4. iluminação, tone mapping, transparência/SSS e fallback WebGL documentados;
5. fallback atômico para `schematic` em asset ou shader inválido;
6. capturas lado a lado em cor, monocromia, movimento reduzido e viewport móvel;
7. picking, teclado, foco e equivalente textual inalterados;
8. draws, tempo GPU, memória de textura e ambiente medidos;
9. cinco hashes idênticos antes/depois da troca de perfil;
10. revisão explícita das alegações proibidas da matriz acima.

## Condições abertas

- R09-E permanece o próximo gate científico e é necessário antes de qualquer
  gradiente dendrítico real na vista Neurônio.
- R09-F continua responsável pela fabricação dos materiais, iluminação,
  películas, isolamento e planos de corte.
- Atlas, anatomia calibrada, hemodinâmica, condução e ultraestrutura não entram
  por acabamento gráfico; exigem contratos científicos ou de assets próprios.

## Critério de encerramento desta auditoria

A auditoria encerra quando testes, build, Worker Wasm, captura local, manifesto,
site publicado e hook `materialProfileAudit()` concordarem sobre ABI 7, cinco
hashes, seis vistas e zero lacuna de proveniência/binding. O resultado final da
execução fica registrado no commit que sincroniza o GIF e no histórico dos
workflows associados.
