# Referências de modelagem

Esta lista sustenta escolhas e limites do roadmap. Ela não funciona como argumento de autoridade para calibrar parâmetros: cada preset deve registrar a fonte específica dos valores que utilizar.

## Unidades e sinapses

- Naud, R.; Marcille, N.; Clopath, C.; Gerstner, W. (2008). [Firing patterns in the adaptive exponential integrate-and-fire model](https://pmc.ncbi.nlm.nih.gov/articles/PMC2798047/). Base para o AdEx e para a distinção entre padrões de disparo e forma completa do potencial de ação.
- Destexhe, A.; Mainen, Z. F.; Sejnowski, T. J. (1994). [An efficient method for computing synaptic conductances based on a kinetic model of receptor binding](https://pubmed.ncbi.nlm.nih.gov/8792231/). Referência para estados cinéticos de receptores.
- McDonnell, M. D.; Mohan, A.; Stricker, C. (2013). [Mathematical analysis and algorithms for efficiently and accurately implementing stochastic simulations of short-term synaptic depression and facilitation](https://pmc.ncbi.nlm.nih.gov/articles/PMC3650633/). Apoia a separação entre modelo conceitual de liberação e algoritmo estocástico.
- Ecker, A. et al. (2020). [Data-driven integration of hippocampal CA1 synaptic physiology in silico](https://pmc.ncbi.nlm.nih.gov/articles/PMC7687201/). Exemplo de integração explícita entre probabilidade de liberação, cinética, plasticidade de curto prazo e anatomia sináptica.
- [IUPHAR/BPS Guide to Pharmacology](https://www.guidetopharmacology.org/). Nomenclatura e famílias de receptores; os parâmetros de circuito ainda exigem fontes experimentais próprias.

## Campos, inferência e observação

- Aqil, M. et al. (2021). [Graph neural fields: A framework for spatiotemporal dynamical models on the human connectome](https://pmc.ncbi.nlm.nih.gov/articles/PMC7872285/). Referência para campos definidos em grafos e para a distinção entre conectividade, Laplaciano e dinâmica de campo.
- Bastos, A. M. et al. (2012). [Canonical microcircuits for predictive coding](https://pmc.ncbi.nlm.nih.gov/articles/PMC3777738/). Base para experimentos de código preditivo, sem implicar uma lei biofísica universal.
- Mazzoni, A. et al. (2015). [Computing the Local Field Potential (LFP) from Integrate-and-Fire Network Models](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1004584). Fundamenta o uso cuidadoso do termo pseudo-LFP em modelos pontuais e o papel de correntes E/I, morfologia e posição.

## Topologia e dinâmica coletiva

- Dabaghian, Y.; Mémoli, F.; Frank, L.; Carlsson, G. (2012). [A topological paradigm for hippocampal spatial map formation using persistent homology](https://pmc.ncbi.nlm.nih.gov/articles/PMC3415417/). Referência para homologia persistente aplicada a padrões de coatividade, não para cálculo indiscriminado em todo frame.
- Chung, S.; Abbott, L. F. (2021). [Neural population geometry: An approach for understanding biological and artificial neural networks](https://doi.org/10.1016/j.conb.2021.10.010). Contexto para geometria de populações e dimensionalidade; a interpretação depende da tarefa e da amostragem.
- Townsend, R. G. et al. (2015). [Emergence of complex wave patterns in primate cerebral cortex](https://pubmed.ncbi.nlm.nih.gov/25788682/). Referência para ondas complexas e singularidades de fase extraídas de sinais espaciais.
- Touboul, J.; Destexhe, A. (2010). [Can power-law scaling and neuronal avalanches arise from stochastic dynamics?](https://pmc.ncbi.nlm.nih.gov/articles/PMC2820096/). Fundamenta os controles contra leis de potência aparentes produzidas por limiarização e processos estocásticos.
- Levina, A.; Priesemann, V. (2017). [Subsampling scaling](https://pmc.ncbi.nlm.nih.gov/articles/PMC5418619/). Referência para o efeito da subamostragem na inferência de regimes críticos.

## Regra de uso

Ao implementar um modelo, o código referencia o preset e a documentação do preset referencia a fonte. Comentários não carregam revisões bibliográficas extensas. Quando duas fontes usam convenções incompatíveis, seus parâmetros não são combinados sem conversão e justificativa explícitas.
