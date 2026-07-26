<div align="center">

<samp>APRENDER RUST CONSTRUINDO UM CÉREBRO QUE POSSO MEDIR, TESTAR E QUESTIONAR.</samp>

<a href="https://blightghp.github.io/blightghp/">
  <img src="assets/brain.gif?v=104ff8e2ab4c" width="760" alt="BRAIN PRO alternando entre a rede cerebral e a coluna cortical L1–L6" />
</a>

<sub>▲ A captura vem do simulador publicado. O SHA na URL identifica o código-fonte usado pelo workflow.</sub>

</div>

---

## BRAIN PRO [v. 0.6.0]

Estou construindo o BRAIN PRO como um caderno de aprendizagem executável. Sou
um programador aprendendo a usar a [Rust Programming Language](https://www.rust-lang.org/)
para transformar dúvidas sobre cérebro, cálculo numérico e sistemas em pequenos
modelos que eu consiga ler, testar e refazer.

Enquanto estudo o **Kandel** — meu percurso por *Principles of Neural Science* —
desenvolvo este projeto para consolidar a aprendizagem no próprio processo. O
livro orienta perguntas e vocabulário; o código não é uma cópia digital do
Kandel nem recebe validade biológica por associação. Cada aproximação precisa
de equação, unidade, limite e teste próprios.

Minha pergunta prática nesta versão é: **como uma entrada talâmica pode atravessar
seis camadas corticais, receber inibição do TRN e voltar por L6 sem bloquear a
interface do navegador?** A resposta atual combina um motor determinístico em
Rust, WebAssembly dentro de um Web Worker e uma apresentação Three.js que apenas
lê snapshots.

### O que consigo explorar hoje

- uma rede procedural de 1.890 nós, com sinapses direcionadas, atrasos,
  condutâncias AMPA/GABA-A, plasticidade STDP e um campo populacional E/I;
- uma coluna didática com populações E/I em L1–L6, vias feedforward/feedback,
  relé talâmico, TRN e retorno corticotalâmico;
- duas vistas sincronizadas: **Visão Geral** e **Lâminas**;
- execução Rust/Wasm em Worker, ABI v4 e treze buffers transferíveis;
- hashes separados para o baseline 0.5 e para o circuito córtico-talâmico;
- replay sombra com três marcos exatos e divergência máxima zero;
- LOD visual com custo declarado de 17, 21 ou 23 draw calls;
- navegação de abas por teclado, movimento reduzido e fallback diagnóstico
  inerte quando o Wasm não carrega.

O ritmo produzido pelo laço relé–TRN é **fenomenológico**. Sem canais de cálcio
tipo T, morfologia, núcleos individualizados e calibração experimental, eu não o
chamo de spindle biológico. Da mesma forma, as formas 3D ajudam a estudar relações
entre estados; elas não são um atlas anatômico.

### Como o projeto se organiza

```text
pergunta de estudo
      ↓
brain-engine (Rust: estado, equações, limites e hashes)
      ├── testes nativos e replay
      └── brain-wasm → Web Worker → snapshot ABI v4
                                      ↓
                       TypeScript → DOM, teclado e Three.js
```

| Parte | O que estou aprendendo e mantendo |
| :-- | :-- |
| `brain-engine` | tipos Rust, ownership, erros explícitos, integração numérica, determinismo e limites de recursos |
| `brain-wasm` | uma fronteira pequena com `wasm-bindgen`, sem duplicar equações no shell |
| Worker | manter o thread de apresentação livre e limitar trabalho por comando |
| TypeScript | protocolo, acessibilidade, DOM e visualização dos dados publicados |
| Three.js | transformar estado em leitura espacial sem inventar atividade |
| Tauri | empacotar a mesma experiência com um host Rust nativo |
| testes | Cargo, Clippy, Vitest, replay Wasm, navegador real e captura reproduzível |

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

O detalhamento está em [PLAN_0.6.md](PLAN_0.6.md), [ROADMAP.md](ROADMAP.md) e
[AUDIT_0.6.md](AUDIT_0.6.md).

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

Para regenerar a ponte e a captura:

```bash
npm run build:wasm
npm run generate:brain-gif
```

O `brain.gif` não muda instantaneamente no perfil: o workflow precisa capturar,
validar, commitar e aguardar a invalidação de cache do GitHub. A sincronização é
reproduzível e de consistência eventual.

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
