# Plano 0.5 · Corredor Rust/Wasm

## Decisão

O simulador migra de “motor TypeScript com host Rust” para “motor Rust
multiplataforma com shell web”. A mudança será feita por paridade, não por uma
reescrita sem oráculo:

```text
presets/eventos
      │
      ▼
brain-engine (Rust puro, determinístico, sem DOM/rede/arquivos)
      ├────────► execução nativa (testes, Tauri, lotes)
      │
      └────────► brain-wasm / wasm-bindgen
                         │
                         ▼
                 Web Worker dedicado
                         │ snapshots tipados
                         ▼
               shell TypeScript + Three.js
```

Rust possui toda a autoridade científica: relógio, RNG, topologia, integração,
eventos, acoplamento, observáveis e hashes. O shell pode escolher câmera, aba,
LOD e interpolação, mas não pode produzir atividade.

## Por que a fronteira é estreita

O alvo oficial `wasm32-unknown-unknown` é adequado ao navegador, mas não oferece
um sistema operacional: arquivo, socket e `std::thread::spawn` não funcionam
como em uma aplicação nativa. Por isso `brain-engine` não importa APIs web e
`brain-wasm` expõe apenas comandos, buffers e metadados versionados.

O módulo Wasm roda inicialmente em um Worker serial. Memória compartilhada e
threads Wasm exigem um contexto cross-origin isolated com COOP/COEP. O baseline
do GitHub Pages não pressupõe esses cabeçalhos; paralelismo futuro precisa
detectar a capacidade e conservar uma execução serial equivalente.

Referências de plataforma:

- [alvo `wasm32-unknown-unknown` no Rust](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html);
- [deploy e formatos de saída do wasm-bindgen](https://wasm-bindgen.github.io/wasm-bindgen/reference/deployment.html);
- [Wasm dentro de Web Worker](https://wasm-bindgen.github.io/wasm-bindgen/examples/wasm-in-web-worker.html);
- [requisitos de isolamento para memória compartilhada](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements).

## Pacotes e autoridade

| Pacote | Responsabilidade | Pode acessar UI? |
| :-- | :-- | :-- |
| `brain-engine` | modelos, solvers, eventos, estado, observáveis e validação | não |
| `brain-wasm` | ABI Wasm, conversão de erro e visão de buffers | não |
| futuro `brain-native` | CLI/lotes, benchmarks e arquivos de replay | não |
| `src/simulation.worker.ts` | carregar Wasm e transportar comandos/snapshots | somente protocolo Worker |
| `src/render-*` | câmera, geometria, cor, abas e acessibilidade | sim; somente leitura do snapshot |
| `src-tauri` | janela desktop e capacidades locais explícitas | sim; sem duplicar o modelo |

## Sequência de migração

1. [x] Fixar no Rust os tipos iniciais de tick, camada, segundo e erro.
2. [x] Portar RNG e relógio; comparar vetores exatos TypeScript↔Rust.
3. [x] Portar o CSR canônico; comparar IDs e offsets. A topologia procedural e
   seu hash permanecem no próximo corte.
4. Portar o campo 0.4; comparar replay e convergência por grandeza.
5. Publicar snapshots Rust no Worker mantendo o renderer atual.
6. Executar os dois motores em modo sombra por cenários curtos.
7. Promover Wasm quando os envelopes e orçamentos forem aprovados.
8. Remover a integração TypeScript; manter apenas tipos/protocolo gerados.

Não haverá dois motores permanentes. Duplicação temporária existe somente para
demonstrar paridade.

O artefato comum `fixtures/parity/discrete-v1.json` é consumido pelos testes
Vitest e Cargo. Assim, uma alteração no contrato discreto não pode atualizar
somente um runtime e conservar dois conjuntos independentes de resultados
esperados.

## Política para C#

C# não “protege” cálculos que já rodam no cliente: qualquer código e dado
entregue ao navegador deve ser tratado como observável e não confiável. Um
runtime .NET Wasm adicional também aumenta download, inicialização e superfície
de interoperabilidade.

C# pode entrar depois como **booster externo** para uma destas funções:

- orquestração de lotes ou filas já integradas ao ecossistema .NET;
- serviço ASP.NET para armazenamento, colaboração ou jobs longos;
- integração desktop/institucional que exija bibliotecas .NET.

O gate exige benchmark contra uma implementação Rust nativa e uma justificativa
operacional. Para kernels numéricos, SIMD, paralelismo e segurança de memória,
Rust permanece a primeira escolha. O simulador publicado no GitHub Pages nunca
depende de um serviço C# para funcionar.

## GIF do perfil: possível, não instantâneo

É possível manter o GIF **automaticamente alinhado** ao simulador:

1. um push relevante em `main` dispara `sync-brain-gif.yml`;
2. o workflow valida e captura o mesmo shell em modo determinístico;
3. `assets/brain.gif` é atualizado;
4. a referência do README recebe os 12 primeiros caracteres do SHA, mudando a
   URL e reduzindo o efeito do cache de imagens;
5. o bot publica os dois arquivos no repositório de perfil.

Isso leva o tempo do runner e do cache do GitHub — normalmente minutos, não
milissegundos. “Instantâneo” não é um contrato realista para Markdown servido e
cacheado por terceiros. Commits feitos com `GITHUB_TOKEN` não disparam novos
workflows, o que evita recursão; a própria documentação do GitHub registra essa
regra e também informa que esse commit não inicia outro build de Pages:
[GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token).

O repositório está atualmente com GitHub Actions desabilitado. A automação só
passará a operar depois que o proprietário habilitar Actions; não é necessário
adicionar PAT ou segredo para o caso de um único repositório.

## Produto final e abas

As abas são estações sobre o mesmo snapshot multiescala, não simuladores
independentes:

1. **Visão Geral** — regiões, atividade composta e saúde numérica;
2. **Superfície** — campo E/I, propagação e conectividade;
3. **Lâminas** — L1–L6, feedforward/feedback e tálamo quando aplicável;
4. **Célula** — tipos celulares, compartimentos e eventos;
5. **Eletricidade** — voltagem, canais, correntes e eletrodos virtuais;
6. **Sinapse** — receptores, vesículas, atrasos e plasticidade;
7. **Bioquímica** — concentração, ocupação, cascatas e difusão;
8. **Sistemas** — circuitos distribuídos sustentados pelo experimento;
9. **Experimentos** — estímulos, tarefas, sementes, replay e comparação;
10. **Validação** — unidades, erro, convergência, proveniência e desempenho.

Uma aba pode reduzir detalhe gráfico, mas não alterar parâmetros silenciosamente.
Toda troca de modelo ou resolução aparece no snapshot e no artefato de replay.
