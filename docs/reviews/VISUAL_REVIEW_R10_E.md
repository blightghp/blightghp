# Revisão visual R10-E · luz, materialidade e limites

**Data:** 28 de agosto de 2026
**Escopo:** 16 capturas físicas em `artifacts/light-materiality`
**Veredito:** paleta e separação de apresentação melhoram; macroforma e topologia ainda limitam a leitura

## Método e escala

Esta revisão compara as capturas R10-E com a
[revisão R10-D](VISUAL_REVIEW_R10_D.md), uma classe de fotografia/seção e uma
classe de render didático/atlas listadas nas
[diretivas R10-E](../planning/NEXT_STAGE_R10_E.md). As referências externas são
alvos de linguagem visual; seus pixels, malhas e dados não são importados.

Escala: 0 = quebrado; 1 = esquemático/rudimentar; 2 = ilustração de macroforma
coerente; 3 = plausibilidade anatômica forte; 4 = atlas/sujeito validado. Um
resultado procedural sem fonte anatômica não recebe 4.

## Leitura da matriz

| Ângulo/modo | Evidência | Leitura | Limite que permanece |
| :-- | :-- | :-- | :-- |
| frontal | `matrix-frontal.png` | a massa cerebral não é mais dominada pelo ciano; córtex e tronco se separam por valor quente/frio sem recolorir o estado | highlights ainda uniformizam parte do relevo e fios cianos competem com a leitura |
| laterais | `matrix-lateral-esquerda/right.png` | a cor-base se mantém nas duas hemisférias e não introduz assimetria de dados | silhueta continua bulbosa e vasos podem aparentar flutuar fora do envelope |
| superior | `matrix-superior.png` | a câmera determinística revela a continuidade da superfície no topo | não há sulcos anatômicos; ruído e baixa frequência continuam evidentes |
| oblíqua | `matrix-obliqua.png` | a mistura regional permanece estável ao mudar a câmera, sem artefato de shader | o relevo não ganha profundidade clínica e o brilho ainda reduz contraste local |
| coronal | `matrix-coronal-corte.png` | a face de corte fica distinta e a sonda mantém unidade/proveniência | a tampa é procedural e explicitamente não anatômica |
| monocromia, móvel e movimento reduzido | `accessibility-*` | a cena continua disponível sem depender da cor, em 390 × 844 e com rotação inicial zero | isso testa disponibilidade e reversão, não valida legibilidade clínica |

## Comparação por vista

| Vista | R10-D | R10-E | Progresso observável | Lacuna remanescente / proprietário |
| :-- | --: | --: | :-- | :-- |
| Visão Geral | 2 | 2 | a paleta quente/neutra remove a leitura de “gel azul”; material, ambiente e corte preservam hashes e orçamento | ainda não é anatomia forte: relevo é procedural, brilho pode achatar planos e vasos não aderem consistentemente ao envelope |
| Lâminas | 1 | 1 | a disciplina de fallback/material não quebra a composição ou os dados | cilindros e espaçamento continuam didáticos, não histologia |
| Célula | 1 | 1 | continua isolada da cor-base regional, sem alegar tecido fotográfico | somas e ramificações permanecem esquemáticos |
| Neurônio | 1 | 1 | materialidade não altera seleção, hashes ou topologia | árvore ilustrativa não identifica tipo, calibre ou morfologia real |
| Eletricidade | 1 | 1 | mantém a identidade de diagrama, sem tentativa de imitar fotografia | continua uma prancha espacial, não anatomia |
| Sinapse | 1 | 1 | não recebe anatomia inventada nem muda o microdomínio | escala e ultraestrutura seguem ilustrativas |

## Decisão

R10-E é aprovado como melhoria **de apresentação reversível**: a paleta deixa de
ser dominada pelo ciano e o contrato preserva geometria, atividade, hashes e
acessibilidade. A evidência não autoriza “fotorrealista”, “atlas”, “seção
anatômica”, “reconstrução clínica” ou qualquer alegação de paciente.

O próximo experimento pode avaliar GTAO apenas no perfil `enhanced`, pois a
matriz física deixou margem no `baseline` e `cinema`. Ele precisa provar ganho
de separação de planos contra essas capturas, custo físico repetido e fallback
limpo; `baseline` não recebe passe novo. GIF, manifesto e README só devem mudar
depois de uma captura que mantenha esses limites explícitos.
