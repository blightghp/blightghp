<div align="center">

<samp>TO THE TRAINED EYE, THERE ARE NO COINCIDENCES...</samp>

<a href="https://blightghp.github.io/blightghp/">
  <img src="assets/brain.gif?v=9962fdac49a9" width="760" alt="Rede neural tridimensional com atividade excitatória e inibitória" />
</a>

<sub>▲ Abra o experimento para orbitar o modelo, isolar regiões e alterar estímulo, plasticidade e escala temporal.</sub>

</div>

---

## Sinapse Formalista

Este experimento combina uma topologia cerebral procedural com uma simulação neural determinística. Os sinais visíveis não percorrem trajetórias decorativas: cada pulso nasce de um disparo, atravessa uma sinapse do grafo e chega ao neurônio de destino depois do atraso calculado para aquela conexão.

O modelo foi desenhado para ser compreensível, mensurável e visualmente
expressivo. Desde a promoção 0.5, o simulador publicado executa as equações no
engine Rust compilado para WebAssembly, dentro de um Web Worker; TypeScript
coordena apenas apresentação e protocolo. “Realista” aqui significa declarar unidades,
hipóteses, solver, erro e evidência — não afirmar que toda a fisiologia humana já
foi reproduzida.

### O que está sendo simulado

- **1.890 nós procedurais:** hemisférios, cerebelo e tronco usam uma semente estável; eles não representam 1.890 neurônios biológicos identificados.
- **Estrutura de sinapses CSR (Compressed Sparse Row):** grafo sináptico comprimido no `brain-engine` para travessia e atualização eficiente de conexões.
- **Campo populacional macroscópico E/I:** kernel de grafo cortical em Rust com populações excitatória ($E$) e inibitória ($I$), histórico temporal e atrasos de condução efetivos.
- **Acoplamento bidirecional Campo-Spikes:** disparos alimentam localmente o campo e a diferença de atividade E/I modula o estado sub-limiar da rede.
- **Cinética receptor-dependente AMPA e GABA-A:** condutâncias sinápticas rápidas (5ms para AMPA, 10ms para GABA-A) com integração temporal.
- **Plasticidade STDP:** disparos próximos no tempo fortalecem ou enfraquecem sinapses excitatórias.
- **Evidência Bayesiana:** cada mudança de estímulo atualiza a crença antes de modular a entrada da rede.
- **Execução Wasm desacoplada em Worker:** simulação em thread dedicada (`simulation.worker.ts`), com snapshots compactos transferidos sem cópia para o thread de apresentação.
- **Atividade superficial & interpolação de snapshots:** a camada de renderização (`render-layers.ts`) apresenta o campo publicado e interpola snapshots consecutivos sem criar eventos.
- **Foco de circuito, zoom & HUD instrumentado:** isolamento visual por região, zoom orbital e instrumentos nomeados (`Hz/nó`, `spikes`, estado LIF em `u.a.`, peso médio e `FPS`).

```text
presets/eventos → brain-engine (Rust: matemática e estado)
                         ├── execução nativa / Tauri
                         └── brain-wasm → Web Worker → snapshots
                                                     ↓
                                  shell TypeScript → Three.js / abas / HUD
```

### Arquitetura

| Camada | Tecnologia | Responsabilidade atual |
| :-- | :-- | :-- |
| Núcleo 0.5 | Rust (`brain-engine`) | Relógio, RNG, CSR, campo E/I, observáveis, contrato laminar, unidades e tipos independentes de plataforma |
| Ponte web | Rust/Wasm (`brain-wasm`) | ABI tipada `wasm-bindgen`, artefato versionado e validado para `wasm32-unknown-unknown` |
| Evidência de migração | Fixture + Cargo + navegador | Replay sombra congelado, hashes exatos e teste da ABI dentro de um Worker real |
| Campo populacional | Rust (`brain-engine`) | Campo E/I 0.4, projeção, atrasos, acoplamento e observáveis; não existe integrador TypeScript paralelo |
| Motor & Worker | Rust/Wasm · Web Worker | Wasm é o padrão; snapshots tipados usam `postMessage` com lista de transferência |
| Tempo & Protocolo | TypeScript | Relógio de apresentação (`clock.ts`) e protocolo v3 (`protocol.ts`); o estado científico nasce no Rust |
| Topologia & Render | Three.js · TypeScript | Anatomia procedural, atividade superficial (`render-layers.ts`), interpolação de snapshots e foco regional |
| Inferência | TypeScript | Atualização Bayesiana normalizada entre duas hipóteses |
| Visualização | Three.js · WebGL | Instâncias, bloom, envoltórios anatômicos, atividade por vértice e instrumentação de FPS |
| Contrato | Zod | Validação dos parâmetros recebidos pela interface e pela URL |
| Desktop | Tauri 2 · Rust | Empacotamento nativo; passará a importar o mesmo `brain-engine` |
| Qualidade | Cargo · Vitest · Puppeteer | Testes nativos, replay Wasm, Worker em navegador, shell e captura |

O browser usa um Worker: Wasm retira o cálculo do shell e não disputa o thread
da interface. Se a ABI não carregar, um fallback diagnóstico publica apenas
estado inerte e a causa da falha — ele não simula nem inventa atividade.
TypeScript permanece como camada fina de
DOM, acessibilidade e apresentação até que uma migração gráfica também demonstre
benefício. C# não faz parte do payload web; pode surgir como serviço offline
somente depois de benchmark e necessidade operacional.

O gate da 0.4 está em [AUDIT_0.4.md](AUDIT_0.4.md), o plano em
[MIGRATION_0.5.md](MIGRATION_0.5.md) e a promoção em
[AUDIT_0.5_PROMOTION.md](AUDIT_0.5_PROMOTION.md).

### Executar localmente

```bash
npm install
npm run dev
```

Para validar o projeto inteiro:

```bash
npm run check
cargo test --workspace
cargo check -p brain-wasm --target wasm32-unknown-unknown
```

Para regenerar a ABI comprometida, instale `wasm-bindgen-cli` 0.2.126 e execute
`npm run build:wasm`. A CI recompila, compara a ABI textual e executa o binário
regenerado contra o replay, além de abrir o simulador em Chromium para provar
que o Worker carregou Rust/Wasm.

O GIF do perfil é reproduzível e usa o mesmo renderer da aplicação:

```bash
npm run generate:brain-gif
```

Quando GitHub Actions estiver habilitado, mudanças relevantes em `main`
executarão a mesma captura e atualizarão o GIF e sua chave de cache no README.
Essa sincronização é automática após o workflow, não instantânea: runners e o
cache de imagens do GitHub introduzem latência.

## Evolução do experimento

Cada versão combina uma melhoria do modelo com um novo patamar gráfico. O projeto separa o que pretende construir, o significado científico dos estados e a forma de validar cada avanço:

- [ROADMAP.md](ROADMAP.md) organiza versões, dependências e ganhos gráficos;
- [MODEL_SPEC.md](MODEL_SPEC.md) registra equações, unidades, hipóteses e limites;
- [ARCHITECTURE.md](ARCHITECTURE.md) traduz o modelo em módulos, tipos, laços e camadas de render;
- [VALIDATION.md](VALIDATION.md) define evidências exatas, numéricas, estatísticas e visuais;
- [MIGRATION_0.5.md](MIGRATION_0.5.md) define a fronteira Rust/Wasm, o papel
  opcional de C# e a sincronização do GIF;
- [AUDIT_0.5_ENTRY.md](AUDIT_0.5_ENTRY.md) registra o gate de entrada, as
  correções que permitiram iniciar a migração;
- [AUDIT_0.5_PROMOTION.md](AUDIT_0.5_PROMOTION.md) registra replay sombra,
  hashes, custos, Worker, fallback e critérios aprovados da promoção;
- [REFERENCES.md](REFERENCES.md) reúne a base científica usada nas decisões.

## Sobre mim

> *"Interesso-me pelas regiões de fronteira em que a lógica encontra a linguagem, a computação encontra a biologia e o rigor formal precisa aprender a conviver com a ambiguidade, a historicidade e a complexidade dos fenômenos humanos."*

Atuo entre pesquisa e desenvolvimento, articulando estudos em linguística, cognição, aprendizagem, ciência de dados e projetos em engenharia de software. Busco transformar perguntas complexas em modelos, sistemas e experimentos sem reduzir os fenômenos àquilo que pode ser facilmente mensurado, preservando, sempre que possível, o equilíbrio entre precisão formal, sensibilidade interpretativa e abertura interdisciplinar. Meu Github é um portal de experimentos dos mais diversos. 
Resumindo, a minha zona de interesse envolve explorar e especular sobre as equivalências conceituais entre biologia e máquina, isto é, conceitos neurobiológicos e computacionais/formais.

---

> **Áreas de interesse**
>
> - Lógica formal e filosofia da lógica
> - Linguística teórica e gramática gerativa
> - Psicometria, neuropsicologia e aprendizagem
> - Ciência de dados e modelagem estatística
> - Engenharia de software e arquitetura de sistemas
> - Inteligência Artificial e sistemas complexos
> - Matemática aplicada e teoria da computação
> - Neurociências cognitivas e biologia da cognição

<div align="center">
  <img src="assets/activity_flow.svg?v=3" width="850" alt="Fluxo longitudinal de contribuições no GitHub" />
</div>

<div align="center">

[![Email](https://img.shields.io/badge/Email-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:ghpgois@gmail.com)
[![Léxikognos](https://img.shields.io/badge/Léxikognos-246BCE?style=flat-square&logo=google-scholar&logoColor=white)](http://lexikognos.com.br) *domínio offline*
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://instagram.com/ppgabrielpinheiro)

<sub><code>fn perceive(signal: &Evidence) -&gt; Result&lt;Knowledge, Entropy&gt;</code></sub>

</div>
