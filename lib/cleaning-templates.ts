// ── Template Catalog ──────────────────────────────────────────────────────────
// Cada plantilla define las tareas de mantenimiento para un tipo de objeto.
// Las viviendas NO copian estas tareas: solo referencian templateId.
// El scheduler calcula nextDue = lastCompleted + frequencyDays.

export interface TemplateTask {
  id: string          // único dentro de la plantilla
  label: string       // nombre legible en español
  frequencyDays: number
}

export interface Template {
  id: string
  label: string       // nombre legible en español
  tasks: TemplateTask[]
}

// Instancia de un objeto en la vivienda
export interface HomeObject {
  id: string
  name: string        // nombre personalizado (ej. "Armario superior 1")
  templateId: string
  config?: Record<string, unknown>
  overrides?: Record<string, { frequencyDays?: number }> // override por taskId
}

export interface HomeArea {
  id: string
  name: string
  objects: HomeObject[]
}

export interface HomeData {
  id: string
  name: string
  areas: HomeArea[]
}

// Tarea resuelta con contexto completo (para el scheduler y la UI)
export interface ResolvedTask {
  key: string           // `${objectId}::${taskId}` — clave única para historial
  objectId: string
  objectName: string
  areaName: string
  templateId: string
  taskId: string
  label: string
  frequencyDays: number
  lastDone?: string     // "YYYY-MM-DD"
  nextDue: string       // "YYYY-MM-DD" calculado por el scheduler
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export const TEMPLATE_CATALOG: Record<string, Template> = {
  floor: {
    id: 'floor',
    label: 'Suelo',
    tasks: [
      { id: 'sweep',  label: 'Barrer / aspirar',  frequencyDays: 3 },
      { id: 'mop',    label: 'Fregar',             frequencyDays: 7 },
      { id: 'grout',  label: 'Limpiar juntas',     frequencyDays: 90 },
    ],
  },
  bed: {
    id: 'bed',
    label: 'Cama',
    tasks: [
      { id: 'change_sheets', label: 'Cambiar sábanas',       frequencyDays: 7 },
      { id: 'wash_pillow',   label: 'Lavar almohada',        frequencyDays: 30 },
      { id: 'flip_mattress', label: 'Girar colchón',         frequencyDays: 180 },
      { id: 'vacuum_mattress', label: 'Aspirar colchón',     frequencyDays: 30 },
    ],
  },
  sofa: {
    id: 'sofa',
    label: 'Sofá',
    tasks: [
      { id: 'vacuum',       label: 'Aspirar cojines y tapizado', frequencyDays: 14 },
      { id: 'deep_clean',   label: 'Limpiar en profundidad',     frequencyDays: 90 },
    ],
  },
  wardrobe: {
    id: 'wardrobe',
    label: 'Armario',
    tasks: [
      { id: 'dust_inside',  label: 'Desempolvar interior',  frequencyDays: 30 },
      { id: 'dust_top',     label: 'Limpiar parte superior', frequencyDays: 14 },
      { id: 'organize',     label: 'Reorganizar ropa',       frequencyDays: 90 },
    ],
  },
  shoe_rack: {
    id: 'shoe_rack',
    label: 'Zapatero',
    tasks: [
      { id: 'dust',    label: 'Desempolvar',       frequencyDays: 14 },
      { id: 'clean',   label: 'Limpiar estantes',  frequencyDays: 30 },
    ],
  },
  cabinet: {
    id: 'cabinet',
    label: 'Armario',
    tasks: [
      { id: 'dust_outside',  label: 'Limpiar exterior',      frequencyDays: 14 },
      { id: 'clean_inside',  label: 'Limpiar interior',      frequencyDays: 30 },
      { id: 'organize',      label: 'Reorganizar contenido', frequencyDays: 90 },
    ],
  },
  drawer: {
    id: 'drawer',
    label: 'Cajones',
    tasks: [
      { id: 'dust',     label: 'Desempolvar exterior',  frequencyDays: 14 },
      { id: 'clean',    label: 'Limpiar interior',      frequencyDays: 60 },
      { id: 'organize', label: 'Reorganizar',           frequencyDays: 90 },
    ],
  },
  shelf: {
    id: 'shelf',
    label: 'Estantería',
    tasks: [
      { id: 'dust',       label: 'Desempolvar baldas',          frequencyDays: 7 },
      { id: 'deep_clean', label: 'Limpiar a fondo + objetos',   frequencyDays: 30 },
    ],
  },
  washing_machine: {
    id: 'washing_machine',
    label: 'Lavadora',
    tasks: [
      { id: 'drum_clean',    label: 'Limpiar tambor (programa vacío + limpiador)', frequencyDays: 30 },
      { id: 'gasket',        label: 'Limpiar junta de goma',      frequencyDays: 14 },
      { id: 'filter',        label: 'Limpiar filtro',             frequencyDays: 60 },
      { id: 'detergent_tray', label: 'Limpiar cajón detergente',  frequencyDays: 14 },
    ],
  },
  sink: {
    id: 'sink',
    label: 'Lavabo',
    tasks: [
      { id: 'clean',        label: 'Limpiar lavabo y grifo',  frequencyDays: 3 },
      { id: 'descale',      label: 'Descalcificar',           frequencyDays: 30 },
      { id: 'drain',        label: 'Limpiar desagüe',         frequencyDays: 30 },
    ],
  },
  kitchen_sink: {
    id: 'kitchen_sink',
    label: 'Fregadero',
    tasks: [
      { id: 'clean',        label: 'Limpiar fregadero y grifo', frequencyDays: 2 },
      { id: 'descale',      label: 'Descalcificar grifo',       frequencyDays: 30 },
      { id: 'drain',        label: 'Limpiar sifón / desagüe',   frequencyDays: 30 },
    ],
  },
  toilet: {
    id: 'toilet',
    label: 'Inodoro',
    tasks: [
      { id: 'clean_bowl',   label: 'Limpiar taza',              frequencyDays: 3 },
      { id: 'clean_outer',  label: 'Limpiar exterior y cisterna', frequencyDays: 7 },
      { id: 'deep_clean',   label: 'Limpieza profunda + antical', frequencyDays: 30 },
    ],
  },
  bathtub: {
    id: 'bathtub',
    label: 'Bañera',
    tasks: [
      { id: 'rinse',        label: 'Aclarar y limpiar bordes',  frequencyDays: 3 },
      { id: 'clean',        label: 'Limpiar con producto',      frequencyDays: 7 },
      { id: 'grout',        label: 'Limpiar juntas de silicona', frequencyDays: 30 },
    ],
  },
  countertop: {
    id: 'countertop',
    label: 'Encimera',
    tasks: [
      { id: 'wipe',         label: 'Limpiar encimera',          frequencyDays: 1 },
      { id: 'deep_clean',   label: 'Desengrasado profundo',     frequencyDays: 14 },
    ],
  },
  hob: {
    id: 'hob',
    label: 'Vitrocerámica',
    tasks: [
      { id: 'wipe',         label: 'Limpiar superficie',        frequencyDays: 2 },
      { id: 'deep_clean',   label: 'Desengrasado profundo',     frequencyDays: 14 },
    ],
  },
  hood: {
    id: 'hood',
    label: 'Campana',
    tasks: [
      { id: 'filter',       label: 'Limpiar filtros metálicos', frequencyDays: 30 },
      { id: 'exterior',     label: 'Limpiar exterior',          frequencyDays: 14 },
    ],
  },
  oven: {
    id: 'oven',
    label: 'Horno',
    tasks: [
      { id: 'interior',     label: 'Limpiar interior',          frequencyDays: 30 },
      { id: 'tray',         label: 'Limpiar bandeja',           frequencyDays: 14 },
      { id: 'glass',        label: 'Limpiar puerta / cristal',  frequencyDays: 14 },
    ],
  },
  fridge: {
    id: 'fridge',
    label: 'Nevera',
    tasks: [
      { id: 'wipe_shelves', label: 'Limpiar estantes y cajones', frequencyDays: 14 },
      { id: 'deep_clean',   label: 'Vaciado y limpieza completa', frequencyDays: 60 },
      { id: 'coils',        label: 'Limpiar rejilla trasera',    frequencyDays: 180 },
    ],
  },
  desk: {
    id: 'desk',
    label: 'Mesa de trabajo',
    tasks: [
      { id: 'surface',      label: 'Limpiar superficie',        frequencyDays: 3 },
      { id: 'drawers',      label: 'Limpiar cajones',           frequencyDays: 30 },
      { id: 'cables',       label: 'Ordenar cables',            frequencyDays: 90 },
    ],
  },
  monitor: {
    id: 'monitor',
    label: 'Monitor',
    tasks: [
      { id: 'screen',       label: 'Limpiar pantalla',          frequencyDays: 14 },
      { id: 'dust_back',    label: 'Desempolvar trasera y puertos', frequencyDays: 30 },
    ],
  },
  laptop: {
    id: 'laptop',
    label: 'Portátil',
    tasks: [
      { id: 'screen',       label: 'Limpiar pantalla',          frequencyDays: 7 },
      { id: 'keyboard',     label: 'Limpiar teclado',           frequencyDays: 14 },
      { id: 'vents',        label: 'Limpiar ventilación',       frequencyDays: 30 },
    ],
  },
  tv: {
    id: 'tv',
    label: 'Televisión',
    tasks: [
      { id: 'screen',       label: 'Limpiar pantalla',          frequencyDays: 14 },
      { id: 'dust_back',    label: 'Desempolvar trasera',       frequencyDays: 30 },
    ],
  },
  tv_unit: {
    id: 'tv_unit',
    label: 'Mueble TV',
    tasks: [
      { id: 'dust',         label: 'Desempolvar exterior',      frequencyDays: 7 },
      { id: 'clean_inside', label: 'Limpiar interior',          frequencyDays: 30 },
    ],
  },
  alexa: {
    id: 'alexa',
    label: 'Alexa',
    tasks: [
      { id: 'wipe',         label: 'Limpiar exterior',          frequencyDays: 14 },
    ],
  },
  window: {
    id: 'window',
    label: 'Ventana',
    tasks: [
      { id: 'glass',        label: 'Limpiar cristales',         frequencyDays: 30 },
      { id: 'frame',        label: 'Limpiar marco y ranuras',   frequencyDays: 30 },
      { id: 'blinds',       label: 'Limpiar persianas / cortinas', frequencyDays: 60 },
    ],
  },
  door: {
    id: 'door',
    label: 'Puerta',
    tasks: [
      { id: 'wipe',         label: 'Limpiar hoja y manilla',   frequencyDays: 14 },
      { id: 'frame',        label: 'Limpiar marco',            frequencyDays: 30 },
    ],
  },
  switch: {
    id: 'switch',
    label: 'Interruptores',
    tasks: [
      { id: 'wipe',         label: 'Limpiar interruptores',    frequencyDays: 14 },
    ],
  },
  socket: {
    id: 'socket',
    label: 'Enchufes',
    tasks: [
      { id: 'wipe',         label: 'Limpiar carcasas enchufes', frequencyDays: 30 },
    ],
  },
  ceiling: {
    id: 'ceiling',
    label: 'Techo',
    tasks: [
      { id: 'dust',         label: 'Desempolvar techo y esquinas', frequencyDays: 30 },
      { id: 'cobwebs',      label: 'Eliminar telarañas',           frequencyDays: 14 },
    ],
  },
  lamp: {
    id: 'lamp',
    label: 'Lámparas',
    tasks: [
      { id: 'dust',         label: 'Desempolvar pantalla / bombilla', frequencyDays: 14 },
      { id: 'clean',        label: 'Limpiar a fondo',               frequencyDays: 60 },
    ],
  },
  balcony: {
    id: 'balcony',
    label: 'Balcón',
    tasks: [
      { id: 'sweep',        label: 'Barrer suelo',              frequencyDays: 7 },
      { id: 'furniture',    label: 'Limpiar mobiliario',        frequencyDays: 30 },
      { id: 'rails',        label: 'Limpiar barandilla',        frequencyDays: 30 },
    ],
  },
  laundry: {
    id: 'laundry',
    label: 'Lavandería',
    tasks: [
      { id: 'wash',         label: 'Poner lavadora',            frequencyDays: 3 },
      { id: 'hang',         label: 'Tender ropa',               frequencyDays: 3 },
      { id: 'collect',      label: 'Recoger ropa',              frequencyDays: 3 },
      { id: 'fold',         label: 'Doblar ropa',               frequencyDays: 3 },
      { id: 'store',        label: 'Guardar ropa',              frequencyDays: 3 },
    ],
  },
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

function getLocalDateStr(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, '0')}-` +
    `${String(d.getDate()).padStart(2, '0')}`
  )
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const base = new Date(y, m - 1, d)
  base.setDate(base.getDate() + days)
  return getLocalDateStr(base)
}

/**
 * Dado un HomeData y el historial de tareas completadas, devuelve la lista
 * completa de ResolvedTask con nextDue calculado.
 * history: Record<key, lastDone> donde key = `${objectId}::${taskId}`
 */
export function resolveHomeTasks(
  home: HomeData,
  history: Record<string, string> // key -> lastDone "YYYY-MM-DD"
): ResolvedTask[] {
  const today = getLocalDateStr()
  const resolved: ResolvedTask[] = []

  for (const area of home.areas) {
    for (const obj of area.objects) {
      const template = TEMPLATE_CATALOG[obj.templateId]
      if (!template) continue

      for (const task of template.tasks) {
        const key = `${obj.id}::${task.id}`
        const lastDone = history[key]
        const freqOverride = obj.overrides?.[task.id]?.frequencyDays
        const frequencyDays = freqOverride ?? task.frequencyDays
        const nextDue = lastDone ? addDays(lastDone, frequencyDays) : today

        resolved.push({
          key,
          objectId: obj.id,
          objectName: obj.name,
          areaName: area.name,
          templateId: obj.templateId,
          taskId: task.id,
          label: task.label,
          frequencyDays,
          lastDone,
          nextDue,
        })
      }
    }
  }

  return resolved
}
