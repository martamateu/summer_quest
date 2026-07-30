// ── IMAS 9-Week Study Plan ─────────────────────────────────────────────────────
// Source: "9-Week Master Study Plan: Introduction to Multiagent Systems (IMAS)"
// Wooldridge, An Introduction to Multiagent Systems (2nd Ed.)

export interface StudyTask {
  id: string
  type: 'theory' | 'practice' | 'deliverable'
  text: string
}

export interface StudyWeek {
  week: number
  title: string
  phase: string
  chapters: string
  pages: string
  theoryHours: number
  practiceHours: number
  totalHours: number
  tasks: StudyTask[]
  deliverable: string
  mandatory?: boolean
}

export const IMAS_PLAN: StudyWeek[] = [
  {
    week: 1,
    title: 'Foundations & Environments',
    phase: 'Phase 1: Individual Intelligent Agents',
    chapters: 'Ch 1',
    pages: 'Preface–14',
    theoryHours: 4,
    practiceHours: 2,
    totalHours: 6,
    deliverable: 'Identify Environment Properties (Accessibility/Determinism)',
    tasks: [
      { id: 'w1-t1', type: 'theory', text: 'Read Wooldridge Ch 1 (Preface–14)' },
      { id: 'w1-t2', type: 'theory', text: 'Master the 5 MAS trends: Ubiquity, Interconnection, Intelligence, Delegation, Human Orientation' },
      { id: 'w1-t3', type: 'theory', text: 'Study Set Theory symbols: ∈, ⊂, ∩, ∪ — agent coalitions & environments' },
      { id: 'w1-p1', type: 'practice', text: 'Define project environment: Accessible or Inaccessible?' },
      { id: 'w1-p2', type: 'practice', text: 'Define project environment: Deterministic or Non-deterministic?' },
      { id: 'w1-p3', type: 'practice', text: 'Define project environment: Static or Dynamic?' },
      { id: 'w1-d1', type: 'deliverable', text: '📋 Deliverable: Environment Properties document' },
    ],
  },
  {
    week: 2,
    title: 'Intelligent Agents & The Intentional Stance',
    phase: 'Phase 1: Individual Intelligent Agents',
    chapters: 'Ch 2',
    pages: '15–46',
    theoryHours: 5,
    practiceHours: 2,
    totalHours: 7,
    deliverable: 'Apply Intentional Stance to Problem Definition',
    tasks: [
      { id: 'w2-t1', type: 'theory', text: 'Read Wooldridge Ch 2 (pp 15–46)' },
      { id: 'w2-t2', type: 'theory', text: 'Master the Intentional Stance — Beliefs, Desires, Intentions (BDI)' },
      { id: 'w2-t3', type: 'theory', text: 'Study core agency properties: Reactivity, Proactiveness, Social Ability' },
      { id: 'w2-t4', type: 'theory', text: 'Prove: "For every reactive agent, there exists a behaviorally equivalent standard agent"' },
      { id: 'w2-p1', type: 'practice', text: 'Form project group and select a complex problem' },
      { id: 'w2-p2', type: 'practice', text: 'Define the Sensors and Effectors of your agent' },
      { id: 'w2-d1', type: 'deliverable', text: '📋 Deliverable: Intentional Stance applied to your problem definition' },
    ],
  },
  {
    week: 3,
    title: 'Deductive Reasoning (Agent-0)',
    phase: 'Phase 1: Individual Intelligent Agents',
    chapters: 'Ch 3',
    pages: '47–64',
    theoryHours: 5,
    practiceHours: 3,
    totalHours: 8,
    deliverable: 'Draft Initial Knowledge Base (Δ) using First-Order Logic',
    tasks: [
      { id: 'w3-t1', type: 'theory', text: 'Read Wooldridge Ch 3 (pp 47–64)' },
      { id: 'w3-t2', type: 'theory', text: 'Study "Agents as Theorem Provers"' },
      { id: 'w3-t3', type: 'theory', text: 'Understand Agent-Oriented Programming (AOP) and Agent-0 syntax' },
      { id: 'w3-t4', type: 'theory', text: 'Master First-Order Logic: ∀, ∃, ⊢ (deduction), ⊨ (entailment)' },
      { id: 'w3-t5', type: 'theory', text: 'Study Epistemic Logic: Kᵢφ — Agent i knows φ (S5 and KD45 systems)' },
      { id: 'w3-p1', type: 'practice', text: 'Experiment with symbolic logic for Vacuum World environment' },
      { id: 'w3-d1', type: 'deliverable', text: '📋 Deliverable: Initial Knowledge Base Δ in First-Order Logic' },
    ],
  },
  {
    week: 4,
    title: 'Practical Reasoning & STRIPS',
    phase: 'Phase 1: Individual Intelligent Agents',
    chapters: 'Ch 4',
    pages: '65–88',
    theoryHours: 5,
    practiceHours: 4,
    totalHours: 9,
    deliverable: 'Diagram "Sense-Decide-Act" Control Loop & STRIPS Plans',
    mandatory: true,
    tasks: [
      { id: 'w4-t1', type: 'theory', text: 'Read Wooldridge Ch 4 (pp 65–88)' },
      { id: 'w4-t2', type: 'theory', text: 'Practical reasoning = Deliberation (what) + Means-Ends reasoning (how)' },
      { id: 'w4-t3', type: 'theory', text: 'Master STRIPS: Pre (preconditions), Add (new facts), Del (removed facts)' },
      { id: 'w4-t4', type: 'theory', text: 'Study Temporal Logic: ○ (next), ◇ (eventually), □ (always), U (until)' },
      { id: 'w4-p1', type: 'practice', text: 'Diagram agent control loop: Sense → Update State → Deliberate → Act' },
      { id: 'w4-p2', type: 'practice', text: 'Justify architectural choice: Deliberative vs. BDI' },
      { id: 'w4-d1', type: 'deliverable', text: '⚠️ MANDATORY Deliverable: Control loop diagram + architecture justification' },
    ],
  },
  {
    week: 5,
    title: 'Reactive Agents & LLM Integration',
    phase: 'Phase 2: Multiagent Interactions & Architectures',
    chapters: 'Ch 5 & 11',
    pages: '89–104; 245–266',
    theoryHours: 5,
    practiceHours: 4,
    totalHours: 9,
    deliverable: 'Code Reactive Behaviors / Review LLM REACT Paper',
    tasks: [
      { id: 'w5-t1', type: 'theory', text: 'Read Wooldridge Ch 5 (pp 89–104) and Ch 11 (pp 245–266)' },
      { id: 'w5-t2', type: 'theory', text: 'Critique the Subsumption Architecture and pure reactivity' },
      { id: 'w5-t3', type: 'theory', text: 'Study REACT paper: synergizing reasoning and acting with LLMs' },
      { id: 'w5-t4', type: 'theory', text: 'Compare LLM-based reasoning vs symbolic logic for agents' },
      { id: 'w5-p1', type: 'practice', text: 'Implement baseline reactive behaviors for your project' },
      { id: 'w5-p2', type: 'practice', text: 'Evaluate LLM agent handling the "reasoning" step' },
      { id: 'w5-d1', type: 'deliverable', text: '📋 Deliverable: Reactive behavior code + REACT paper review notes' },
    ],
  },
  {
    week: 6,
    title: 'Strategic Interactions & Game Theory',
    phase: 'Phase 2: Multiagent Interactions & Architectures',
    chapters: 'Ch 6',
    pages: '105–128',
    theoryHours: 4,
    practiceHours: 5,
    totalHours: 9,
    deliverable: 'Define Utility Functions and Interaction Preferences',
    tasks: [
      { id: 'w6-t1', type: 'theory', text: 'Read Wooldridge Ch 6 (pp 105–128)' },
      { id: 'w6-t2', type: 'theory', text: 'Transition from individual logic to social systems' },
      { id: 'w6-t3', type: 'theory', text: 'Study Utility functions and Nash Equilibrium' },
      { id: 'w6-p1', type: 'practice', text: 'Model your agent\'s preferences with utility functions' },
      { id: 'w6-p2', type: 'practice', text: 'Identify if project interaction is Zero-sum or Cooperative' },
      { id: 'w6-d1', type: 'deliverable', text: '📋 Deliverable: Utility functions and interaction preferences defined' },
    ],
  },
  {
    week: 7,
    title: 'Reaching Agreements & Mechanism Design',
    phase: 'Phase 2: Multiagent Interactions & Architectures',
    chapters: 'Ch 7',
    pages: '129–162',
    theoryHours: 4,
    practiceHours: 6,
    totalHours: 10,
    deliverable: 'Implement Negotiation/Auction Logic',
    tasks: [
      { id: 'w7-t1', type: 'theory', text: 'Read Wooldridge Ch 7 (pp 129–162)' },
      { id: 'w7-t2', type: 'theory', text: 'Master Auction types: English, Dutch, Vickrey, First-price sealed-bid' },
      { id: 'w7-t3', type: 'theory', text: 'Study Negotiation protocols and why Vickrey discourages "shills"' },
      { id: 'w7-p1', type: 'practice', text: 'Implement a Dutch auction or monotonic concession protocol' },
      { id: 'w7-p2', type: 'practice', text: 'Apply chosen protocol to project\'s resource allocation' },
      { id: 'w7-d1', type: 'deliverable', text: '📋 Deliverable: Negotiation/auction logic implemented' },
    ],
  },
  {
    week: 8,
    title: 'Communication & Working Together',
    phase: 'Phase 3: Coordination, Communication & Consolidation',
    chapters: 'Ch 8 & 9',
    pages: '163–188; 189–224',
    theoryHours: 4,
    practiceHours: 7,
    totalHours: 11,
    deliverable: 'Implement FIPA-ACL Communicative Acts',
    tasks: [
      { id: 'w8-t1', type: 'theory', text: 'Read Wooldridge Ch 8 (pp 163–188) and Ch 9 (pp 189–224)' },
      { id: 'w8-t2', type: 'theory', text: 'Study Speech Act Theory (Austin, Searle)' },
      { id: 'w8-t3', type: 'theory', text: 'Master FIPA-ACL and KQML communication languages' },
      { id: 'w8-t4', type: 'theory', text: 'Understand Contract Net Protocol for task sharing' },
      { id: 'w8-p1', type: 'practice', text: 'Code communication layer: Inform, Request, Propose acts' },
      { id: 'w8-p2', type: 'practice', text: 'Ensure agents can exchange FIPA-ACL messages correctly' },
      { id: 'w8-d1', type: 'deliverable', text: '📋 Deliverable: FIPA-ACL communicative acts implemented' },
    ],
  },
  {
    week: 9,
    title: 'Review & Final Submission',
    phase: 'Phase 3: Coordination, Communication & Consolidation',
    chapters: 'Review all',
    pages: 'Ch 1–9, 11',
    theoryHours: 4,
    practiceHours: 7,
    totalHours: 11,
    deliverable: 'Final Project Submission & Report Writing',
    mandatory: true,
    tasks: [
      { id: 'w9-t1', type: 'theory', text: 'Synthesize Chapters 1–9 and 11 — full course review' },
      { id: 'w9-t2', type: 'theory', text: 'Review modern LLM-based MAS vs traditional BDI' },
      { id: 'w9-t3', type: 'theory', text: 'Complete Level 1 & 2 exercises at the end of every chapter' },
      { id: 'w9-p1', type: 'practice', text: 'Final system stress testing' },
      { id: 'w9-p2', type: 'practice', text: 'Write final report: link code to formal logic (Section 2)' },
      { id: 'w9-p3', type: 'practice', text: 'Prepare oral presentation — justify coordination techniques' },
      { id: 'w9-d1', type: 'deliverable', text: '⚠️ MANDATORY: Final project submission + report + presentation' },
    ],
  },
]

// ── CI 7-Week Study Plan ───────────────────────────────────────────────────────
// Source: "Computational Intelligence (CI-MAI) Intensive Study & Programming Schedule"
// Engelbrecht, Computational Intelligence: An Introduction (2nd Ed.)
// Prep: 3 Aug → 20 Sep 2026

export const CI_PLAN: StudyWeek[] = [
  {
    week: 1,
    title: 'Foundations & Paradigms',
    phase: 'Week 1: Fundamentos',
    chapters: 'Engelbrecht Ch 1 (Sección 1.1, 1.2)',
    pages: '3 ago – 9 ago',
    theoryHours: 3,
    practiceHours: 2,
    totalHours: 5,
    deliverable: 'Visualización del paisaje de aptitud f(z) = z²',
    tasks: [
      { id: 'ci-w1-t1', type: 'theory', text: 'Sintetizar Sección 1.1: los 4 paradigmas de IC — NN, EC, SI y FS' },
      { id: 'ci-w1-t2', type: 'theory', text: 'Orígenes biológicos: sistemas neuronales (NN), evolución natural (EC), comportamiento social en enjambres (SI), interacción organismo-entorno (FS)' },
      { id: 'ci-w1-t3', type: 'theory', text: 'Historia (Sección 1.2): Turing Test (1950), Zadeh fuzzy sets (1965) y el término "Soft Computing"' },
      { id: 'ci-w1-p1', type: 'practice', text: 'Configurar entorno de desarrollo Python o C++' },
      { id: 'ci-w1-p2', type: 'practice', text: 'Implementar visualización de f(z) = z² como paisaje de búsqueda (fitness landscape) — entender cómo GA/PSO lo navegarán para encontrar el mínimo global' },
      { id: 'ci-w1-d1', type: 'deliverable', text: '📋 Deliverable: Entorno configurado + script de visualización del paisaje de aptitud' },
    ],
  },
  {
    week: 2,
    title: 'Neural Sprint: Neurona Artificial y Aprendizaje',
    phase: 'Week 2: Redes Neuronales',
    chapters: 'Engelbrecht Ch 2-4, Haykin (MLPs & Backprop)',
    pages: '10 ago – 16 ago',
    theoryHours: 4,
    practiceHours: 3,
    totalHours: 7,
    deliverable: 'Red neuronal Feedforward con Regla Delta Generalizada desde cero',
    tasks: [
      { id: 'ci-w2-t1', type: 'theory', text: 'Contrastar SU (suma ponderada, Ec. 2.1) vs PU (combinaciones de orden superior, Ec. 2.2)' },
      { id: 'ci-w2-t2', type: 'theory', text: 'Geometría de la neurona (Sección 2.3): Separabilidad Lineal e Hiperplano n-dimensional' },
      { id: 'ci-w2-t3', type: 'theory', text: 'Contrastar Regla Delta Generalizada (Sección 2.4.4, requiere activación diferenciable) vs Regla de Corrección de Error (Sección 2.4.5, asume función escalón)' },
      { id: 'ci-w2-t4', type: 'theory', text: 'Haykin: "Multilayer Perceptrons" y "Back-Propagation Learning" — contexto matemático profundo para Sección 3.2' },
      { id: 'ci-w2-p1', type: 'practice', text: 'Implementar una neurona artificial desde cero' },
      { id: 'ci-w2-p2', type: 'practice', text: 'Implementar red Feedforward con Regla Delta Generalizada (activación Sigmoid, Ec. 2.6)' },
      { id: 'ci-w2-d1', type: 'deliverable', text: '📋 Deliverable: Red neuronal Feedforward funcional con GDR desde cero' },
    ],
  },
  {
    week: 3,
    title: 'Evolutionary Sprint: GA y Programación Genética',
    phase: 'Week 3: Computación Evolutiva',
    chapters: 'Engelbrecht Ch 8-10, Bartz-Beielstein',
    pages: '17 ago – 23 ago',
    theoryHours: 4,
    practiceHours: 3,
    totalHours: 7,
    deliverable: 'Algoritmo Genético con Selección por Torneo y Elitismo',
    tasks: [
      { id: 'ci-w3-t1', type: 'theory', text: 'Entidades clave (Sección 1.1.2): Cromosoma (solución candidata), Gen & Alelo (característica y su valor)' },
      { id: 'ci-w3-t2', type: 'theory', text: 'Dominar operadores: Crossover (combinación de material genético) y Mutación (diversidad por alteración de alelos)' },
      { id: 'ci-w3-t3', type: 'theory', text: 'Selección por Torneo (Sección 8.4.3) y Elitismo (Sección 8.4.5) para proteger los mejores individuos' },
      { id: 'ci-w3-t4', type: 'theory', text: 'Bartz-Beielstein: diseño experimental y optimización de parámetros de algoritmos evolutivos' },
      { id: 'ci-w3-p1', type: 'practice', text: 'Implementar GA básico para optimización numérica con Tournament Selection + Elitismo' },
      { id: 'ci-w3-d1', type: 'deliverable', text: '📋 Deliverable: GA funcional con Tournament Selection y Elitismo implementados' },
    ],
  },
  {
    week: 4,
    title: 'Swarm Intelligence: PSO y ACO',
    phase: 'Week 4: Inteligencia de Enjambres',
    chapters: 'Engelbrecht Ch 16-17 (Sección 1.1.3)',
    pages: '24 ago – 30 ago',
    theoryHours: 4,
    practiceHours: 3,
    totalHours: 7,
    deliverable: 'Implementación de PSO con topologías Estrella (gbest) y Anillo (lbest)',
    tasks: [
      { id: 'ci-w4-t1', type: 'theory', text: 'Contrastar PSO (coreografía social de bandadas, gbest) vs ACO (depósito de feromonas de hormigas) — Sección 1.1.3' },
      { id: 'ci-w4-t2', type: 'theory', text: 'Mecánica PSO (Sección 16.1): Topología Estrella → Global Best (gbest) vs Topología Anillo → Local Best (lbest) dentro del vecindario' },
      { id: 'ci-w4-t3', type: 'theory', text: 'ACO: búsqueda de rutas óptimas mediante rastro de feromonas y comportamiento de forrajeo' },
      { id: 'ci-w4-p1', type: 'practice', text: 'Implementar PSO: rastrear posiciones y velocidades de partículas, actualizar con experiencia individual + influencia de gbest' },
      { id: 'ci-w4-p2', type: 'practice', text: 'Implementar ambas topologías: Estrella (gbest) y Anillo (lbest) y comparar convergencia' },
      { id: 'ci-w4-d1', type: 'deliverable', text: '📋 Deliverable: PSO implementado con topologías Estrella y Anillo' },
    ],
  },
  {
    week: 5,
    title: 'Fuzzy Sprint: Lógica Difusa y Controladores',
    phase: 'Week 5: Lógica Difusa',
    chapters: 'Engelbrecht Ch 18-20, Klir & Yuan',
    pages: '31 ago – 6 sep',
    theoryHours: 4,
    practiceHours: 3,
    totalHours: 7,
    deliverable: 'Controlador Mamdani completo: Fuzzificación → Inferencia → Defuzzificación',
    tasks: [
      { id: 'ci-w5-t1', type: 'theory', text: 'Tipo de incertidumbre: estadística (probabilidad) vs no estadística (vaguedad y ambigüedad — fuzziness)' },
      { id: 'ci-w5-t2', type: 'theory', text: 'Componentes difusos (Sección 18.5): Funciones de Membresía, Variables Lingüísticas (ej. "Alto") y Hedges ("Muy", "Algo")' },
      { id: 'ci-w5-t3', type: 'theory', text: 'Klir & Yuan: "Fuzzy Sets" y "Fuzzy Relations" — base matemática' },
      { id: 'ci-w5-p1', type: 'practice', text: 'Crear controlador Mamdani (Sección 20.2.2) para regulación de temperatura' },
      { id: 'ci-w5-p2', type: 'practice', text: 'Implementar pipeline completo: Fuzzificación → Inferencia de Reglas → Defuzzificación → salida crisp' },
      { id: 'ci-w5-d1', type: 'deliverable', text: '📋 Deliverable: Controlador Mamdani funcional para problema de control' },
    ],
  },
  {
    week: 6,
    title: 'Performance Analysis & Buffer',
    phase: 'Week 6: Rendimiento y Margen',
    chapters: 'Engelbrecht Ch 7 (Secciones 7.1, 7.3)',
    pages: '7 sep – 13 sep',
    theoryHours: 3,
    practiceHours: 3,
    totalHours: 6,
    deliverable: 'Auditoría de MSE + análisis de sensibilidad en NN y GA',
    tasks: [
      { id: 'ci-w6-t1', type: 'theory', text: 'Preparación de datos (Sección 7.3.1), Inicialización de pesos (Sección 7.3.2) y Medidas de precisión (Sección 7.1.1)' },
      { id: 'ci-w6-t2', type: 'theory', text: 'Completar Assignments de Engelbrecht Ch 1-4, 8-10 y 16-17' },
      { id: 'ci-w6-p1', type: 'practice', text: 'Auditoría de precisión: MSE para regresión y Classification Error para tareas categóricas en implementaciones anteriores' },
      { id: 'ci-w6-p2', type: 'practice', text: 'Análisis de sensibilidad en NN y GA: variar tasa de aprendizaje, tasa de mutación y tamaño de población → observar impacto en convergencia (Sección 7.1.3)' },
      { id: 'ci-w6-d1', type: 'deliverable', text: '📋 Deliverable: Informe de auditoría MSE + análisis de sensibilidad documentado' },
    ],
  },
  {
    week: 7,
    title: 'First Class Week & Final Review',
    phase: 'Week 7: Primera Clase y Repaso',
    chapters: 'Engelbrecht Ch 22, Apéndices A/B',
    pages: '14 sep – 20 sep',
    theoryHours: 3,
    practiceHours: 2,
    totalHours: 5,
    deliverable: 'Hoja de fórmulas completa + auditoría de símbolos lista para el 17 sep',
    mandatory: true,
    tasks: [
      { id: 'ci-w7-t1', type: 'theory', text: 'Compilar hoja de fórmulas: SU (Ec. 2.1), PU (Ec. 2.2), Sigmoid (Ec. 2.6), SSE (Ec. 2.11), Weight Update GD (Ec. 2.12)' },
      { id: 'ci-w7-t2', type: 'theory', text: 'Fluidez en Apéndice B: Símbolos para NN, EC y Fuzzy Systems' },
      { id: 'ci-w7-t3', type: 'theory', text: 'Derivar la actualización de pesos para una unidad Sigmoid (Ec. 2.18)' },
      { id: 'ci-w7-t4', type: 'theory', text: 'Distinción clara: motivación de PSO (gbest) vs ACO (feromonas). Impacto de inicialización de pesos (Sección 7.3.2). Membresía en controladores Mamdani' },
      { id: 'ci-w7-t5', type: 'theory', text: 'Ch 22: conclusiones sobre sistemas híbridos de IC' },
      { id: 'ci-w7-d1', type: 'deliverable', text: '⚠️ MANDATORY: Hoja de fórmulas + checklist de preparación completados antes del 17 sep' },
    ],
  },
]

// ── CI Week calculation ────────────────────────────────────────────────────────
// Prep starts: Monday 3 August 2026 (week 1)
// Course starts: 17 September 2026
export const CI_START_DATE = '2026-08-03' // Monday of week 1

export function getCurrentCiWeek(): number {
  const start = new Date(CI_START_DATE + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = today.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 0) return 1
  const week = Math.floor(diffDays / 7) + 1
  return Math.min(week, 7)
}

export function getCiWeekDateRange(week: number): { start: string; end: string } {
  const start = new Date(CI_START_DATE + 'T00:00:00')
  start.setDate(start.getDate() + (week - 1) * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(start), end: fmt(end) }
}

// ── Week calculation ───────────────────────────────────────────────────────────
// Course starts: Monday 14 July 2026 (week 1)
// Marta starts studying: 16 July 2026
export const IMAS_START_DATE = '2026-07-14' // Monday of week 1

export function getCurrentImasWeek(): number {
  const start = new Date(IMAS_START_DATE + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffMs = today.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 0) return 1
  const week = Math.floor(diffDays / 7) + 1
  return Math.min(week, 9)
}

export function getImasWeekDateRange(week: number): { start: string; end: string } {
  const start = new Date(IMAS_START_DATE + 'T00:00:00')
  start.setDate(start.getDate() + (week - 1) * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(start), end: fmt(end) }
}

// ── Carryover logic ────────────────────────────────────────────────────────────
// Un carryover task tiene id: "carry-w{targetWeek}-{originalTaskId}"
// Esto permite que la semana N muestre tareas sin hacer de semanas anteriores.

export function getCarryoverId(targetWeek: number, originalTaskId: string): string {
  return `carry-w${targetWeek}-${originalTaskId}`
}

export function parseCarryoverId(id: string): { targetWeek: number; originalTaskId: string } | null {
  const m = id.match(/^carry-w(\d+)-(.+)$/)
  if (!m) return null
  return { targetWeek: Number(m[1]), originalTaskId: m[2] }
}

// Devuelve las tareas sin hacer de semanas anteriores que deben mostrarse en targetWeek
export function getCarryoverTasks(
  targetWeek: number,
  checks: Record<string, boolean>
): (StudyTask & { fromWeek: number; carryId: string })[] {
  const result: (StudyTask & { fromWeek: number; carryId: string })[] = []
  // Revisar todas las semanas anteriores
  for (let w = 1; w < targetWeek; w++) {
    const week = IMAS_PLAN[w - 1]
    if (!week) continue
    for (const task of week.tasks) {
      const originalDone = checks[task.id]
      const carryId = getCarryoverId(targetWeek, task.id)
      const carryDone = checks[carryId]
      // Si no está hecha en la semana original NI en el carryover de esta semana
      if (!originalDone && !carryDone) {
        result.push({ ...task, fromWeek: w, carryId })
      }
    }
  }
  return result
}
