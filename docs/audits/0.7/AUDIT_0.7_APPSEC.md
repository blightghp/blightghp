# Revisão de qualidade e AppSec · BRAIN PRO 0.7

Data: 2026-08-02. Escopo: `cell_patch`, composição macro–micro, ABI Wasm v5,
Worker e novas superfícies DOM/Three.js.

## Fronteiras revisadas

- drives aceitam apenas números finitos, taxas entre 0 e 500 Hz e corrente de
  contorno entre 0 e 1 nA;
- o passo acima de 1 ms, intervalos incompatíveis e mais de 4.096 subpassos são
  rejeitados antes do laço microscópico;
- tick, spike e índice usam conversões verificadas e erros explícitos;
- `ResolutionMap` valida comprimentos, domínio, IDs e conservação dos pesos;
- o Worker conserva cotas de topologia, fila e no máximo 600 ticks por comando;
- o fallback continua inerte: não cria atividade nem replica equações em TS;
- os valores usados no DOM vêm de chaves receptoras fechadas, sem HTML dinâmico;
- a CSP Tauri permanece restritiva e nenhum endpoint, segredo ou permissão foi
  adicionado.

## Achados e correções

1. O crescimento de `NeuralSimulation::step` excedeu o limite de 100 linhas.
   O avanço do patch foi extraído para uma operação dedicada; a regra Clippy não
   foi suprimida.
2. A primeira regeneração Wasm foi bloqueada por retorno incompatível do helper.
   O snapshot interno passou a ser descartado explicitamente e os bindings foram
   regenerados antes do typecheck.
3. O contrato de transferência ainda esperava 13 buffers. O teste foi atualizado
   para exigir 22 buffers distintos e incluir correntes celulares.

## Risco aceito

O custo microscópico é serial e fixo em 12 × 200 integrações por tick macro. É
adequado ao preset atual, mas não autoriza aumentar células ou ativar acoplamento
bilateral sem novo envelope e benchmark. O hash detecta regressão; não é uma
função criptográfica nem autentica replays externos.

Veredito: nenhuma falha aberta impede a promoção da 0.7.
