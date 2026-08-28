# Diretivas da próxima etapa · R10-E luz e materialidade

**Estado:** em andamento — corte 1 (tone mapping reversível); não promovido, com gates
físicos, acessibilidade e comparação visual ainda pendentes.

**Corte 1:** `?toneMapping=agx` é o candidato atual; `?toneMapping=aces` preserva a
reversão explícita e `neutral` fica disponível apenas para comparação A/B. Alto contraste,
perda de contexto e erro de shader efetivam ACES até a condição segura ser restaurada.

**Branch prevista:** `blightghp/r10-e-light-materiality`

**WIP:** 1; nenhum corte Unrail abre em paralelo

**Baseline:** R10-D concluído, validado e [auditado](../audits/0.10/AUDIT_0.10_R10_D.md)

## Resultado esperado

Converter a macroforma procedural atual de “gel azul iluminado” em uma
ilustração anatômica 3D mais convincente por luz, resposta de material e
hierarquia de planos — sem alegar atlas, sem alterar geometria científica e sem
acrescentar custo líquido ao perfil `baseline`.

R10-E não consegue transformar ruído procedural em sulcos anatômicos nem corrigir
vasos que atravessam o envelope. Ele deve revelar melhor a forma existente e
deixar essas limitações explícitas, não escondê-las com bloom ou saturação.

## Diagnóstico visual de entrada

A inspeção das capturas anterior, lateral e coronal de
`artifacts/procedural-surface/` confirma:

| Dimensão | Estado R10-D | Alvo de R10-E |
| :-- | :-- | :-- |
| silhueta | macroforma reconhecível, ainda bulbosa e de baixa frequência | preservar; luz não deve fingir detalhe geométrico ausente |
| relevo | cavidades rasas, leitura dependente do ciano | separar giros/sulcos com key/fill/rim e AO assada |
| material | plástico/gel uniforme, azul elétrico dominante | tecido ilustrativo quente/neutro, rugosidade e lobo úmido controlados |
| profundidade | fundo preto e emissão comprimem planos | grade tonal e contraste local sem esmagar pretos |
| cerebelo/tronco | volumes legíveis, folia e transições fracas | parâmetros regionais distintos; nenhuma folia inventada por shader |
| vasos | tubos grossos, saturados e por vezes desconectados do envelope | reduzir competição visual e integrar luz; topologia fica fora do corte |
| corte | volume exposto ainda não lê como face de seção | material de seção distinguível, sempre `DECORATION` |
| outras cinco vistas | funcionais, mas majoritariamente rudimentares | aplicar a mesma disciplina de luz/material sem homogeneizar escalas |

## Referências comparativas

As referências são consultadas, não copiadas nem distribuídas:

- [NLM Visible Human · color cryosections](https://www.nlm.nih.gov/research/visible/photos.html): cor e relação córtex/cerebelo/tronco em seção;
- [Human Connectome Project · organização neurobiológica](https://www.humanconnectome.org/study/hcp-young-adult/project-protocol/neurobiologically-grounded-connectome): proporção, variabilidade e densidade da folha cortical;
- [BrainFacts/Society for Neuroscience · 3D Brain](https://www.brainfacts.org/3D-Brain): hierarquia didática e separação de regiões em um viewer 3D revisado;
- [EBRAINS · Human Brain Atlas](https://ebrains.eu/data-tools-services/brain-atlases/human-brain): navegação multiescala e distinção entre template, atlas e visualização;
- [revisão R10-D](../reviews/VISUAL_REVIEW_R10_D.md): comparação interna e limites já promovidos.

Cada captura final deve ficar lado a lado com R10-D e com pelo menos duas classes
externas: uma fotografia/seção e um render didático/atlas. A auditoria descreve
diferenças; não importa pixels ou geometria dessas fontes.

## Ordem de implementação

1. Congelar seed, câmeras, seis vistas e captura anterior antes de mudar shader.
2. Introduzir tone mapping AgX/Neutral atrás de feature reversível para ACES;
   recalibrar exposição sem alterar a codificação de estado.
3. Reequilibrar ambiente e key/fill/rim para criar sombra de contato, borda e
   separação de planos sem bloom global.
4. Remover `transmission` do `baseline`; compor material em camadas baratas:
   base difusa, wrap diffuse, Fresnel/lobo úmido, `thickness`, `aoFactor` e grade.
5. Criar parâmetros regionais para córtex, cerebelo, tronco, vasos e face de
   corte; estado científico colorido permanece em overlay/emissão separada.
6. Validar o contrato `onBeforeCompile`, clamps, `NaN`/infinito e fallback WebGL.
7. Aplicar a disciplina às seis vistas, sem forçar o diagrama Eletricidade a
   imitar fotografia nem atribuir anatomia falsa a Célula/Neurônio/Sinapse.
8. Só ativar GTAO em meia resolução no perfil `enhanced` se a GPU física provar
   margem; `baseline` não recebe passe novo.
9. Gerar matriz final frontal, laterais, superior, oblíqua e coronal, mais seis
   vistas, monocromia, móvel e movimento reduzido.
10. Executar auditoria, sincronizar gerador/GIF/manifesto, atualizar README e só
    então promover/mergear.

## Gates de segurança

- zero dependência nova sem revisão de pacote, versão, licença e advisory;
- uniformes/material params limitados; valores não finitos ou fora do envelope
  caem para defaults seguros;
- nenhuma URL, textura ou asset externo novo;
- shader não escreve nem retroalimenta estado científico;
- clipping, face de corte e overlay continuam apresentação pura;
- conteúdo de captura não recebe alegação clínica, de paciente ou de atlas;
- `npm audit --omit=dev` registrado separadamente de achados de dev tooling.

## Gates de desempenho

- comparar contra o artefato R10-C no mesmo hardware/driver e protocolo;
- registrar warm-up, 24 amostras, p50/p95, draws, triângulos, texturas e heap por
  vista/perfil;
- `baseline` sem passe adicional e sem custo acima da tolerância versionada;
- remoção de `transmission` precisa mostrar custo igual ou menor;
- nenhuma compilação de shader, alocação ou recriação de material por quadro;
- cinco hashes científicos e hash geométrico R10-D invariantes.

## Gates visuais e acessíveis

- reexecutar invertibilidade pixel→estado, saturação, monocromia e contraste;
- distinguir córtex, cerebelo, tronco e vasos também sem cor;
- impedir highlight especular de apagar sulcos ou texto;
- preservar foco, equivalente textual e movimento reduzido;
- não usar bloom, transparência ou cor para ocultar falha de silhueta/topologia;
- revisão humana registra progresso e lacunas por vista na escala 0–4 da R10-D.

## Comandos mínimos

```bash
npm run typecheck
npm run test
npm run build
npm run audit:material
npm run audit:presentation-budget
npm run verify:presentation-budget
npm run verify:procedural-surface
npm run audit:runtime
npm run check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
npm audit --omit=dev
npm run sync:brain-gif
npm run verify:brain-gif
```

Testes de GPU física e captura são obrigatórios mesmo quando o CI headless passa.

## Entregáveis

- implementação e testes em `src/render`/camadas proprietárias;
- `artifacts/light-materiality/` com matriz, ambiente e métricas;
- `docs/audits/0.10/AUDIT_0.10_R10_E.md`;
- `docs/reviews/VISUAL_REVIEW_R10_E.md`;
- GIF, manifesto e README sincronizados somente após a captura promovida;
- roadmap apontando R10-F apenas depois de todos os gates.

## Rollback e pronto

Tone mapping e material anterior permanecem atrás de uma reversão atômica durante
o corte. R10-E só está pronto quando segurança, desempenho, acessibilidade,
comparação estética, hashes, gerador visual, README e auditoria concordarem. Uma
imagem “mais bonita” sem esses gates não é promoção.
