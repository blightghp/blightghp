<div align="center">

<samp>APRENDER RUST CONSTRUINDO UM CÉREBRO QUE POSSO MEDIR, TESTAR E QUESTIONAR.</samp>

<a href="https://blightghp.github.io/blightghp/">
  <img src="assets/brain.gif?v=fd3be0932f78" width="760" alt="BRAIN PRO com rede cerebral, coluna L1–L6 e patch celular elétrico" />
</a>

<sub>▲ Captura do simulador publicado. O SHA na URL e o <a href="assets/brain-gif.json">manifesto</a> ligam o GIF ao commit, à ABI e aos três hashes do motor.</sub>

</div>

---

## BRAIN PRO [v. 0.8 em construção · base 0.7 íntegra]

Estou construindo o BRAIN PRO como um caderno de aprendizagem executável. Sou
um programador aprendendo a usar a [Rust Programming Language](https://www.rust-lang.org/)
para transformar dúvidas sobre cérebro, cálculo numérico e sistemas em pequenos
modelos que eu consiga ler, testar e refazer.

Enquanto estudo o **Kandel** — meu percurso por *Principles of Neural Science* —
desenvolvo este projeto para consolidar a aprendizagem no próprio processo. O
livro orienta perguntas e vocabulário; o código não é uma cópia digital do
Kandel nem recebe validade biológica por associação. Cada aproximação precisa
de equação, unidade, limite e teste próprios.

Minha pergunta prática nesta fase é: **como ampliar a resolução — da rede à
sinapse e da forma à química — sem desenhar um fenômeno que o motor não
calcula?** A base 0.7 continua sendo um patch AdEx determinístico em Rust, com
WebAssembly dentro de um Web Worker. A 0.8 começou pelo contrato: separou matéria
de emissão na imagem e congelou recursos, unidades e conservação antes de criar
dinâmica química.

### O que consigo explorar hoje

- uma rede procedural de 1.890 nós, com sinapses direcionadas, atrasos,
  condutâncias AMPA/GABA-A, plasticidade STDP e um campo populacional E/I;
- uma coluna didática com populações E/I em L1–L6, vias feedforward/feedback,
  relé talâmico, TRN e retorno corticotalâmico;
- um patch com 12 células AdEx, dendrito passivo, adaptação e receptores AMPA,
  NMDA, GABA-A e GABA-B integrados a `83,3 µs`;
- quatro vistas sincronizadas: **Visão Geral**, **Lâminas**, **Célula** e
  **Eletricidade**;
- execução Rust/Wasm em Worker, ABI v5 e 22 buffers transferíveis;
- hashes separados para o baseline 0.5, circuito córtico-talâmico e patch celular;
- pipeline visual com matéria, emissão e composição; bloom restrito ao que
  realmente emite e proveniência declarada por objeto;
- contrato 0.8-a para recurso vesicular `R`, utilização `u`, liberação `uR`,
  cinco estoques em mol equivalente e carga transmembrana em coulombs;
- replay sombra com três marcos exatos, fila genérica `(tick, sequence)` e
  divergência máxima zero;
- cadência de snapshots em 60/30/15/10 Hz e perfil de CPU, GPU, memória e
  latência sem alterar o passo fixo;
- curvas axonais recorrentes em L1–L6, ciclos independentes e LOD visual com
  custo de cena declarado de 26, 36 ou 44 draw calls;
- navegação de abas por teclado, movimento reduzido e fallback diagnóstico
  inerte quando o Wasm não carrega.

O ritmo produzido pelo laço relé–TRN e as classes celulares são
**fenomenológicos**. O patch não possui morfologia multicompartimental, canais
intrínsecos detalhados nem calibração experimental. As formas 3D ajudam a estudar
relações entre estados; elas não são um atlas anatômico.

### Como o projeto se organiza

```text
pergunta de estudo
      ↓
brain-engine (Rust: estado, equações, limites e hashes)
      ├── chemical_contract (recursos, massa e carga; ainda sem dinâmica)
      ├── testes nativos e replay
      └── brain-wasm → Web Worker → snapshot ABI v5
                                      ↓
                       TypeScript → DOM, teclado e Three.js
```

| Parte | O que estou aprendendo e mantendo |
| :-- | :-- |
| `brain-engine` | tipos Rust, ownership, erros explícitos, integração numérica, determinismo, recursos e invariantes de conservação |
| `brain-wasm` | uma fronteira pequena com `wasm-bindgen`, sem duplicar equações no shell |
| Worker | manter o thread de apresentação livre e limitar trabalho por comando |
| TypeScript | protocolo, acessibilidade, DOM e visualização dos dados publicados |
| Three.js | transformar estado em leitura espacial sem inventar atividade |
| Tauri | empacotar a mesma experiência com um host Rust nativo |
| testes | Cargo, Clippy, Vitest, replay celular, convergência de eventos/correntes, ensembles, Wasm em navegador, contraste e captura reproduzível |

C# continua fora do payload web. Só fará sentido como serviço nativo/offline se
um benchmark reproduzível demonstrar uma necessidade que Rust/Wasm não atende.

### Diário de aprendizagem

A data de 2025 pertence ao meu percurso pessoal; o histórico verificável deste
repositório começa em **2026-07-20**. Faço essa distinção para não transformar
memória de estudo em falsa proveniência Git.

| Data | Passo |
| :-- | :-- |
| 2025 | começo a organizar o estudo de Rust, neurociência e modelagem matemática; o Kandel passa a funcionar como eixo de perguntas |
| 2026-07-20 | nasce o histórico Git do experimento e a primeira topologia procedural |
| 2026-07-24 | fecho relógio, Worker, CSR, campo E/I e a superfície 0.4 |
| 2026-07-26 | promovo Rust/Wasm como motor padrão na 0.5 e preservo o replay sombra |
| 2026-07-26 | fecho a 0.6 com L1–L6, relé/TRN, ABI v4, aba Lâminas e auditoria de recursos |
| 2026-08-02 | fecho a 0.7 com AdEx, quatro receptores, ResolutionMap, ABI v5 e as abas Célula/Eletricidade |
| 2026-08-10 | abro a 0.8 com auditoria visual, passes matéria/emissão e o contrato de recursos, massa e carga antes da dinâmica química |

O detalhamento da base está em [PLAN_0.7.md](PLAN_0.7.md) e
[AUDIT_0.7.md](AUDIT_0.7.md). A sequência atual, o contrato visual e a auditoria
de entrada estão em [ROADMAP_NEXT.md](ROADMAP_NEXT.md),
[VISUAL_SPEC.md](VISUAL_SPEC.md) e [AUDIT_0.8_ENTRY.md](AUDIT_0.8_ENTRY.md).

### Executar e conferir

```bash
npm install
npm run dev
```

Para repetir os gates:

```bash
npm run check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo check -p brain-wasm --target wasm32-unknown-unknown
```

O gate web também gera capturas temporárias em desktop/mobile e audita teclado,
contraste e o perfil de execução. Para preservar esses artefatos em um diretório:

```bash
BRAIN_AUDIT_DIR=artifacts/visual-audit npm run audit:runtime
```

Para recompilar a ponte e gerar uma captura vinculada ao motor atual:

```bash
npm run sync:brain-gif
npm run verify:brain-gif
```

O workflow recompila o Wasm antes da captura, exige runtime `rust-wasm`/ABI v5,
registra os três hashes independentes e o SHA-256 do GIF em
[`assets/brain-gif.json`](assets/brain-gif.json), carimba o README com o commit
de origem e só então publica os artefatos. O GitHub ainda pode levar alguns
minutos para invalidar o cache do perfil.

### Leituras que me acompanham

- [The Rust Programming Language](https://doc.rust-lang.org/book/) — ownership,
  erros, traits, concorrência e a linguagem que estou aprendendo;
- [Rust `wasm32-unknown-unknown`](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html)
  e [wasm-bindgen em Web Worker](https://wasm-bindgen.github.io/wasm-bindgen/examples/wasm-in-web-worker.html)
  — a passagem controlada do motor para o navegador;
- [MDN · WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly) —
  referência do ambiente web;
- Kandel et al., [*Principles of Neural Science*](https://books.google.com/books/about/Principles_of_Neural_Science_Sixth_Editi.html?id=8yGq0QEACAAJ)
  — projeto de estudo e fonte de questões neurocientíficas;
- [Allen Institute · Education Resources](https://alleninstitute.org/education/resources)
  — apoio para anatomia, dados e leitura crítica.

As referências científicas específicas de cada modelo estão em
[REFERENCES.md](REFERENCES.md). Registro equações e limites em
[MODEL_SPEC.md](MODEL_SPEC.md), a separação dos módulos em
[ARCHITECTURE.md](ARCHITECTURE.md) e os critérios de evidência em
[VALIDATION.md](VALIDATION.md).

## Sobre mim

> *Interesso-me pelas regiões de fronteira em que a lógica encontra a linguagem,
> a computação encontra a biologia e o rigor formal precisa aprender a conviver
> com a ambiguidade, a historicidade e a complexidade dos fenômenos humanos.*

Atuo entre pesquisa e desenvolvimento, articulando linguística, cognição,
aprendizagem, ciência de dados e engenharia de software. Meu GitHub é um portal
de experimentos: uso código para pensar, mas procuro não reduzir um fenômeno
àquilo que é mais fácil medir.

O BRAIN PRO expressa uma particularidade desse percurso. Ao estudar Rust e o
Kandel lado a lado, exploro aproximações e diferenças entre biologia e máquina:
o que pode ser formalizado, o que permanece interpretação e o que ainda exige
melhor evidência.

> **Áreas de interesse**
>
> - lógica formal e filosofia da lógica;
> - linguística teórica e gramática gerativa;
> - psicometria, neuropsicologia e aprendizagem;
> - ciência de dados e modelagem estatística;
> - engenharia de software e arquitetura de sistemas;
> - inteligência artificial e sistemas complexos;
> - matemática aplicada e teoria da computação;
> - neurociências cognitivas e biologia da cognição.

### SIGNALS

O gráfico abaixo funciona como um traço longitudinal do trabalho público. Ele
não inventa atividade anterior ao Git: a indicação “desde 2025” pertence à
linha de aprendizagem descrita acima; os pontos vêm das contribuições
registradas pelo GitHub.

<div align="center">
  <img src="assets/activity_flow.svg?v=4" width="850" alt="BRAIN PRO SIGNALS: contribuições públicas como traços do percurso de aprendizagem" />
</div>

<div align="center">

[![Email](https://img.shields.io/badge/Email-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:ghpgois@gmail.com)
[![Léxikognos](https://img.shields.io/badge/L%C3%A9xikognos-246BCE?style=flat-square&logo=google-scholar&logoColor=white)](http://lexikognos.com.br) *domínio offline*
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://instagram.com/ppgabrielpinheiro)

<sub><code>fn perceive(signal: &Evidence) -&gt; Result&lt;Knowledge, Entropy&gt;</code></sub>

</div>
