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
