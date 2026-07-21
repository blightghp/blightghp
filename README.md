<div align="center">

<samp>TO THE TRAINED EYE, THERE ARE NO COINCIDENCES...</samp>

[![Validar ecossistema](https://github.com/blightghp/blightghp/actions/workflows/ci.yml/badge.svg)](https://github.com/blightghp/blightghp/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/blightghp/blightghp/actions/workflows/deploy.yml/badge.svg)](https://github.com/blightghp/blightghp/actions/workflows/deploy.yml)

<a href="https://blightghp.github.io/blightghp/">
  <img src="assets/brain.gif?v=3" width="760" alt="Cérebro neural 3D girando lentamente enquanto impulsos sinápticos percorrem conexões azuis" />
</a>

<sub>▲ Clique no cérebro para explorar o motor neural 3D para ajustar a órbita, as camadas anatômicas, o bloom e fazer a inferência Bayesiana em tempo real para modulação sináptica...</sub>

</div>

---

### Um ecossistema, duas camadas, uma topologia

A "brincadeira" acima é a prova do potencial de uso do ecossistema Rust aliado à comunicação com sistemas web... O mesmo grafo procedural alimenta a experiência web, o GIF reproduzível do perfil e o aplicativo desktop. O que eu fiz? A interface TypeScript conversa com um runtime Rust via Tauri e as entradas são validadas por schema, enquanto invariantes visuais são protegidos por Vitest.

| Camada | Tecnologia | Papel no sistema |
| :-- | :-- | :-- |
| **Core nativo** | `Rust` · `Serde` | Runtime tipado e comandos seguros do desktop |
| **Desktop bridge** | `Tauri 2` | IPC mínimo entre o motor nativo e a interface |
| **Motor visual** | `TypeScript` · `Three.js` | Topologia 3D, órbita, bloom e impulsos instanciados |
| **Contrato** | `Zod Schema` | Configuração validada antes de alcançar o renderer |
| **Qualidade** | `Vitest` · `Cargo test` | Determinismo do grafo e contrato cross-stack |
| **Automação** | `JavaScript` · `GitHub Actions` | Captura do GIF, gráfico de atividade e deploy contínuo |

<div align="center">

[![Rust](https://img.shields.io/badge/Rust-101828?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Tauri](https://img.shields.io/badge/Tauri_2-101828?style=for-the-badge&logo=tauri&logoColor=24C8DB)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-101828?style=for-the-badge&logo=typescript&logoColor=4A9EFF)](https://www.typescriptlang.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-101828?style=for-the-badge&logo=javascript&logoColor=F7DF1E)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Vitest](https://img.shields.io/badge/Vitest-101828?style=for-the-badge&logo=vitest&logoColor=6E9F18)](https://vitest.dev/)
[![Zod](https://img.shields.io/badge/Zod_Schema-101828?style=for-the-badge&logo=zod&logoColor=3E67B1)](https://zod.dev/)

</div>

```text
evidence → Zod schema → TypeScript state → Three.js graph
                                      ↕
                              Tauri IPC · Rust
                                      ↓
                       Vitest + Cargo + GitHub Pages
```

## Sobre mim

> *"Tenho interesse especial pelos pontos de encontro entre lógica, linguagem, biologia e computação. É nesse espaço interdisciplinar que desenvolvo meus projetos, pesquisas e experimentos."*

Sou pesquisador por vocação e desenvolvedor pela necessidade de transformar ideias em artefatos verificáveis. Minha curiosidade percorre diferentes domínios do conhecimento — linguística, psicologia, neurociências, lógica, matemática, ciência de dados e engenharia de software — sempre guiada pela mesma pergunta: **como sistemas complexos representam informação, produzem significado e aprendem**.

Tenho especial apreço pelo rigor formal. A lógica, a matemática, a estatística e a arquitetura de software fornecem os instrumentos necessários para construir hipóteses explícitas, modelos consistentes e inferências reproduzíveis. Ao mesmo tempo, acredito que nenhum formalismo é suficiente quando isolado da realidade que pretende descrever. Por isso, procuro integrar esses modelos à riqueza da linguagem, à dinâmica dos sistemas biológicos e às múltiplas formas pelas quais a cognição humana emerge e se transforma.

Vejo a pesquisa como um processo de síntese entre precisão e criatividade. Interessa-me construir pontes entre abstração matemática e fenômenos concretos, entre algoritmos e comportamento, entre teoria e implementação. Cada projeto representa uma tentativa de compreender um aspecto dessa arquitetura mais ampla, em que computação, cognição e linguagem deixam de ser campos independentes para formar diferentes perspectivas sobre um mesmo sistema.

Este perfil reúne parte dessa trajetória. Os repositórios aqui publicados refletem meu interesse por desenvolvimento de software, modelagem formal, visualização de sistemas complexos, psicometria, linguística teórica, neurociências e ciência de dados. Mais do que produtos acabados, eles constituem laboratórios de investigação, nos quais novas hipóteses são continuamente formuladas, testadas e refinadas.

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
[![Léxikognos](https://img.shields.io/badge/Léxikognos-246BCE?style=flat-square&logo=google-scholar&logoColor=white)](http://lexikognos.com.br)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://instagram.com/ppgabrielpinheiro)

<sub><code>fn perceive(signal: &Evidence) -&gt; Result&lt;Knowledge, Entropy&gt;</code></sub>

</div>
