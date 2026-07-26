# Auditoria de progresso 0.6 · BRAIN PRO

## 0.6-a · Contrato laminar

Estado: **aprovado em 2026-07-26**.

Evidência:

- seis IDs estáveis e conversão inválida rejeitada;
- populações E/I limitadas a `[0,1]`;
- matriz documentada como `[alvo][origem]`;
- recorrência, feedforward e feedback classificados separadamente dos ganhos;
- pares fora do modelo rejeitados antes da integração;
- ganhos e drives com tetos nomeados;
- testes unitários e de contrato executados sob Clippy estrito.

Limite aceito: o preset é uma ferramenta de aprendizagem e não uma calibração
de uma área cortical ou espécie. O próximo corte pode acoplar tálamo e TRN, mas
não pode chamar o ritmo resultante de spindle biológico.

## 0.6-b · Tálamo e TRN

Estado: **aprovado em 2026-07-26**.

Evidência:

- relé, TRN, rebote e L1–L6 avançam no mesmo tick determinístico;
- atrasos possuem buffers próprios, reinicialização e máximo de 4.096 passos;
- ganhos e drives são limitados antes do cálculo;
- estados permanecem finitos e em `[0,1]`;
- a entrada constante produz variação sustentada depois do transiente;
- o controle que abre TRN→relé elimina essa variação;
- testes nativos e Clippy estrito aprovados.

Limite aceito: o circuito é uma massa neural fenomenológica. Não há canais de
cálcio tipo T, morfologia, subdivisão de núcleos ou ajuste contra EEG; “ritmo”
não significa “spindle biológico”.

## 0.6-c · Motor e Worker

Estado: **aprovado em 2026-07-26**.

Evidência:

- ABI Rust/Wasm/TypeScript promovida para schema 4;
- E/I de L1–L6 e cinco escalares talâmicos publicados em buffers compactos;
- treze `ArrayBuffer` distintos são transferidos pelo Worker;
- hash novo separado do hash legado;
- replay sombra mantém três marcos exatos e divergência máxima zero;
- cotas duplicadas defensivamente no host e no adaptador Wasm;
- navegador real inicializa Rust/Wasm dentro do Worker;
- fallback diagnóstico permanece inerte;
- Cargo, Clippy, Vitest, TypeScript, Vite e teste de navegador aprovados.

Limite aceito: o circuito córtico-talâmico observa estímulo/contexto e alimenta
sua própria coluna. Nesta versão ele não modifica retroativamente a rede 0.5;
essa separação evita dupla contagem e preserva o oráculo de migração.

## 0.6-d · Aba Lâminas

Estado: **aprovado em 2026-07-26**.

Evidência:

- coluna explodida mostra L1–L6, populações E/I, relé e TRN;
- nove vias visuais pertencem ao contrato declarado;
- cores, opacidade e escala leem somente o snapshot ABI v4;
- LODs baixo/médio/alto submetem 17/21/23 draw calls;
- parsers rejeitam vistas e LODs desconhecidos;
- abas suportam setas, Home, End e foco roving;
- movimento ornamental cessa com preferência reduzida;
- enquadramento e métricas foram inspecionados no navegador;
- teste end-to-end ativa a aba e confirma valores finitos.

Limite aceito: ocultar vias reduz draw calls, mas as geometrias continuam
residentes. A vista não acrescenta anatomia além do modelo agregado.
