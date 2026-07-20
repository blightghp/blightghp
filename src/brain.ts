import * as THREE from 'three';

export interface BrainData {
  nodes: THREE.Vector3[];
  edges: [number, number][];
  paths: number[][]; // Loops fechados simulando clusters de informação temporal
  boltPaths: number[][]; // Subconjunto de trajetos longos destacados como raios âmbar
  groups: {
    leftHemi: number[];
    rightHemi: number[];
    cerebellum: number[];
    stem: number[];
  };
}

// Gerador procedural da arquitetura neuro-algorítmica
// Modelando a biologia através de restrições matemáticas e trigonométricas puras
export function generateBrainData(): BrainData {
  const nodes: THREE.Vector3[] = [];
  const leftHemi: number[] = [];
  const rightHemi: number[] = [];
  const cerebellum: number[] = [];
  const stem: number[] = [];

  // 1. Hemisférios Cerebrais (A sede das variáveis instantâneas V_t)
  const makeHemisphere = (side: number): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [];
    const numTheta = 16;
    const numPhi = 24;
    
    for (let i = 0; i < numTheta; i++) {
      const theta = 0.08 + (Math.PI - 0.16) * (i / (numTheta - 1));
      let phiSteps = Math.floor(numPhi * Math.sin(theta));
      if (phiSteps < 4) phiSteps = 4;
      
      for (let j = 0; j < phiSteps; j++) {
        const phi = -Math.PI / 2 + Math.PI * (j / (phiSteps - 1));
        
        // Modelando os sulcos e giros. Sem isso, seria só uma esfera genérica sem graça.
        const r = 1.0 + 0.11 * Math.sin(15 * theta) * Math.cos(15 * phi) + 0.04 * Math.cos(6 * theta);
        
        const x_scale = 0.55;
        const y_scale = 0.85;
        const z_scale = 0.6;
        
        let x = side * (0.16 + x_scale * r * Math.sin(theta) * Math.cos(phi));
        const y = y_scale * r * Math.sin(theta) * Math.sin(phi);
        const z = 0.1 + z_scale * r * Math.cos(theta);
        
        // Fissura longitudinal - separando o formalismo do empirismo
        if (side === 1 && x < 0.05) x = 0.05;
        if (side === -1 && x > -0.05) x = -0.05;
        
        pts.push(new THREE.Vector3(x, y, z));
      }
    }
    
    // Matéria branca interna - onde as decisões em micromilésimos trafegam
    for (let k = 0; k < 80; k++) {
      const theta = Math.random() * (Math.PI - 0.2) + 0.1;
      const phi = Math.random() * Math.PI - Math.PI / 2;
      const r = Math.random() * 0.8 * (1.0 + 0.08 * Math.sin(10 * theta) * Math.cos(10 * phi));
      
      const x_scale = 0.55;
      const y_scale = 0.85;
      const z_scale = 0.6;
      
      let x = side * (0.16 + x_scale * r * Math.sin(theta) * Math.cos(phi));
      const y = y_scale * r * Math.sin(theta) * Math.sin(phi);
      const z = 0.1 + z_scale * r * Math.cos(theta);
      
      if (side === 1 && x < 0.05) x = 0.05;
      if (side === -1 && x > -0.05) x = -0.05;
      
      pts.push(new THREE.Vector3(x, y, z));
    }
    
    return pts;
  };

  // 2. Cerebelo (Processamento inferencial subcortical)
  const makeCerebellum = (): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [];
    const numLayers = 10;
    const numRing = 16;
    
    for (let i = 0; i < numLayers; i++) {
      const zFrac = i / (numLayers - 1);
      const z = -0.32 - 0.28 * zFrac;
      let rLayer = 0.45 * Math.sin(Math.PI * zFrac);
      if (rLayer < 0.05) rLayer = 0.05;
      
      for (let j = 0; j < numRing; j++) {
        const angle = 2 * Math.PI * j / numRing;
        // Folhas cerebelares densas e horizontais
        const r = rLayer * (1.0 + 0.07 * Math.sin(30 * angle));
        const x = r * Math.cos(angle);
        const y = -0.65 + r * Math.sin(angle);
        pts.push(new THREE.Vector3(x, y, z));
      }
    }
    
    // Nós internos
    for (let k = 0; k < 40; k++) {
      const z = Math.random() * -0.28 - 0.32;
      const r = Math.random() * 0.35;
      const angle = Math.random() * 2 * Math.PI;
      const x = r * Math.cos(angle);
      const y = -0.65 + r * Math.sin(angle);
      pts.push(new THREE.Vector3(x, y, z));
    }
    
    return pts;
  };

  // 3. Tronco Cerebral (O elo primordial C_t)
  const makeStem = (): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [];
    const numSections = 8;
    const numRadial = 8;
    
    for (let i = 0; i < numSections; i++) {
      const z = -0.6 - 0.55 * (i / (numSections - 1));
      const radius = 0.16 * (1.2 + z);
      for (let j = 0; j < numRadial; j++) {
        const angle = 2 * Math.PI * j / numRadial;
        const x = radius * Math.cos(angle);
        const y = -0.35 + radius * Math.sin(angle);
        pts.push(new THREE.Vector3(x, y, z));
      }
    }
    return pts;
  };

  // Instanciando e catalogando a morfologia
  const leftPts = makeHemisphere(-1);
  leftPts.forEach((p, idx) => {
    nodes.push(p);
    leftHemi.push(idx);
  });

  const rightPts = makeHemisphere(1);
  const leftLen = nodes.length;
  rightPts.forEach((p, idx) => {
    nodes.push(p);
    rightHemi.push(leftLen + idx);
  });

  const cerebPts = makeCerebellum();
  const baseCereb = nodes.length;
  cerebPts.forEach((p, idx) => {
    nodes.push(p);
    cerebellum.push(baseCereb + idx);
  });

  const stemPts = makeStem();
  const baseStem = nodes.length;
  stemPts.forEach((p, idx) => {
    nodes.push(p);
    stem.push(baseStem + idx);
  });

  // Mapeamento topológico das conexões sinápticas (Arestas do Grafo Bayesiano)
  const edges: [number, number][] = [];
  const maxConnections = 3;
  const maxDist = 0.28;
  const edgeSet = new Set<string>();

  // A função de custo que decide quem se conecta com quem
  const canConnect = (i: number, j: number): boolean => {
    const p1 = nodes[i];
    const p2 = nodes[j];
    const d = p1.distanceTo(p2);
    
    if (d > maxDist || d < 0.02) return false;
    
    const isLeftI = leftHemi.includes(i);
    const isRightI = rightHemi.includes(i);
    const isLeftJ = leftHemi.includes(j);
    const isRightJ = rightHemi.includes(j);
    
    if ((isLeftI && isRightJ) || (isRightI && isLeftJ)) {
      // O corpo caloso é o único gateway de alta densidade entre os hemisférios
      const inCallosumI = Math.abs(p1.x) < 0.15 && p1.y > -0.2 && p1.y < 0.2 && p1.z > 0.0 && p1.z < 0.35;
      const inCallosumJ = Math.abs(p2.x) < 0.15 && p2.y > -0.2 && p2.y < 0.2 && p2.z > 0.0 && p2.z < 0.35;
      return inCallosumI && inCallosumJ;
    }
    
    return true;
  };

  const adj: number[][] = Array.from({ length: nodes.length }, () => []);

  for (let i = 0; i < nodes.length; i++) {
    const candidates: { dist: number; idx: number }[] = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      if (canConnect(i, j)) {
        candidates.push({ dist: nodes[i].distanceTo(nodes[j]), idx: j });
      }
    }
    // Ordena pela distância pra simular a eficiência energética das sinapses curtas
    candidates.sort((a, b) => a.dist - b.dist);
    
    let count = 0;
    for (const c of candidates) {
      if (count >= maxConnections) break;
      const u = Math.min(i, c.idx);
      const v = Math.max(i, c.idx);
      const key = `${u}-${v}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([u, v]);
        adj[u].push(v);
        adj[v].push(u);
      }
      count++;
    }
  }

  // Buscando ciclos fechados para representar o feedback loop bayesiano
  const findLoopPath = (startNode: number, targetLength = 6): number[] | null => {
    const path: number[] = [startNode];
    let curr = startNode;
    
    for (let k = 0; k < targetLength - 3; k++) {
      const neighbors = adj[curr];
      if (neighbors.length === 0) return null;
      
      let choices = neighbors;
      if (path.length > 1) {
        choices = neighbors.filter(n => n !== path[path.length - 2]);
        if (choices.length === 0) choices = neighbors;
      }
      
      // Passeio aleatório pra modelar estocasticidade neural
      curr = choices[Math.floor(Math.random() * choices.length)];
      path.push(curr);
    }
    
    // Busca em Largura (BFS) brutal pra forçar o retorno à raiz do circuito
    const queue: number[][] = [[curr]];
    const visited = new Set<number>([curr]);
    let foundPath: number[] | null = null;
    
    while (queue.length > 0) {
      const p = queue.shift()!;
      const node = p[p.length - 1];
      
      if (node === startNode && p.length > 2) {
        foundPath = p;
        break;
      }
      
      for (const n of adj[node]) {
        if (p.length > 1 && n === p[p.length - 2]) continue;
        if (!visited.has(n) || (n === startNode && p.length > 2)) {
          visited.add(n);
          queue.push([...p, n]);
        }
      }
    }
    
    if (foundPath) {
      return [...path, ...foundPath.slice(1, -1)];
    }
    return null;
  };

  const paths: number[][] = [];
  const maxPaths = 300; 
  
  // Enchendo a rede de correntes prontas pra disparar
  for (let k = 0; k < maxPaths; k++) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const start = Math.floor(Math.random() * nodes.length);
      if (adj[start].length === 0) continue;
      const path = findLoopPath(start, Math.floor(Math.random() * 5) + 5);
      if (path && path.length >= 3) {
        paths.push(path);
        break;
      }
    }
  }

  // Curando os "raios" hero: os trajetos mais longos, espalhados pela superfície
  // pra não empilharem no mesmo canto. Esses ganham o destaque âmbar/laranja.
  const boltPaths: number[][] = [];
  const boltStartPositions: THREE.Vector3[] = [];
  const minBoltSeparation = 0.55;
  const sortedByLength = [...paths].sort((a, b) => b.length - a.length);

  for (const path of sortedByLength) {
    if (boltPaths.length >= 7) break;
    const startPos = nodes[path[0]];
    const tooClose = boltStartPositions.some(p => p.distanceTo(startPos) < minBoltSeparation);
    if (tooClose) continue;
    boltPaths.push(path);
    boltStartPositions.push(startPos);
  }

  return {
    nodes,
    edges,
    paths,
    boltPaths,
    groups: { leftHemi, rightHemi, cerebellum, stem }
  };
}
