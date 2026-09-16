// Casos etiquetados para el arnés de evaluación de extracción (docs/tickets/6.md).
// No es una prueba: no hay umbral de aprobación y no participa en `npm test`.
//
// `kind` determina qué mide cada caso:
// - resolvable / correction: la especialidad final debe coincidir con `expectedSpecialty`.
// - urgent: el sistema debe detenerse (`stop`) por una señal de alarma descrita con
//   palabras propias del paciente, nunca con la frase exacta de la lista cerrada.
// - vague: el sistema debe preguntar en vez de adivinar una especialidad.
//
// Las señales de alarma y el umbral pediátrico (<12 años) están descritos en
// docs/tickets/6.md bajo "Datos del caso" y "Señales de alarma".

export const cases = [
  { id: 'resolvable-dermatology', kind: 'resolvable', expectedSpecialty: 'dermatology',
    messages: ['Tengo unas ronchas rojas y me pica mucho la piel del brazo desde ayer.'] },
  { id: 'resolvable-gastro', kind: 'resolvable', expectedSpecialty: 'gastro',
    messages: ['Siento mucha acidez y ardor en el estómago después de comer.'] },
  { id: 'resolvable-trauma', kind: 'resolvable', expectedSpecialty: 'trauma',
    messages: ['Me torcí el tobillo jugando fútbol y no puedo apoyar el pie.'] },
  { id: 'resolvable-gyn', kind: 'resolvable', expectedSpecialty: 'gyn',
    messages: ['Estoy embarazada de cinco meses y quiero un control prenatal.'] },
  { id: 'resolvable-pediatrics', kind: 'resolvable', expectedSpecialty: 'pediatrics',
    messages: ['Mi bebé de dos años está decaído y no quiere comer.'] },
  { id: 'resolvable-ent', kind: 'resolvable', expectedSpecialty: 'ent',
    messages: ['Me duele mucho la garganta y tengo la voz ronca desde hace tres días.'] },
  { id: 'resolvable-ophthalmology', kind: 'resolvable', expectedSpecialty: 'ophthalmology',
    messages: ['Tengo el ojo derecho rojo e irritado y veo un poco borroso.'] },
  { id: 'resolvable-urology', kind: 'resolvable', expectedSpecialty: 'urology',
    messages: ['Me arde mucho cuando orino desde hace dos días.'] },
  { id: 'resolvable-endocrinology', kind: 'resolvable', expectedSpecialty: 'endocrinology',
    messages: ['Me diagnosticaron el azúcar alta hace un tiempo y quiero que revisen mi tiroides.'] },
  { id: 'resolvable-general', kind: 'resolvable', expectedSpecialty: 'general',
    messages: ['Me he sentido cansado y con un poco de fiebre los últimos dos días, nada en particular.'] },

  // El caso motivador del ticket: un vómito frecuente descrito en palabras propias,
  // no la frase exacta "vomita todo" que el detector anterior exigía.
  { id: 'urgent-vomito-frecuente', kind: 'urgent', expectedRedFlags: ['vomito_persistente'],
    messages: ['Mi hijo tiene fiebre y vomita cada 30 minutos desde la tarde.'] },
  { id: 'urgent-respirar', kind: 'urgent', expectedRedFlags: ['dificultad_respiratoria'],
    messages: ['A mi papá le cuesta mucho respirar y se ve muy agitado.'] },
  { id: 'urgent-labios', kind: 'urgent', expectedRedFlags: ['labios_azules'],
    messages: ['Mi hijo tiene los labios morados y la fiebre no le baja.'] },
  { id: 'urgent-convulsion', kind: 'urgent', expectedRedFlags: ['convulsion'],
    messages: ['Mi hija empezó a temblar sin control y puso los ojos en blanco por unos segundos.'] },
  { id: 'urgent-no-despierta', kind: 'urgent', expectedRedFlags: ['no_despierta'],
    messages: ['Mi hijo está muy dormido y no logro que reaccione ni abra los ojos.'] },
  { id: 'urgent-no-bebe', kind: 'urgent', expectedRedFlags: ['no_bebe_liquidos'],
    messages: ['Mi bebé lleva horas sin querer tomar ni agua ni leche, rechaza todo.'] },
  { id: 'urgent-sangrado', kind: 'urgent', expectedRedFlags: ['sangrado_abundante'],
    messages: ['Se cortó con un vidrio y no para de sangrar por más que le hago presión.'] },
  { id: 'urgent-deshidratacion', kind: 'urgent', expectedRedFlags: ['deshidratacion'],
    messages: ['Lleva dos días con diarrea, tiene la boca muy seca y casi no ha orinado.'] },

  { id: 'vague-no-me-siento-bien', kind: 'vague',
    messages: ['No me siento bien.'] },
  { id: 'vague-malestar-general', kind: 'vague',
    messages: ['Tengo un malestar general desde hace unos días.'] },

  // El ejemplo de corrección de docs/tickets/6.md: el dato correcto debe ganar
  // sin reiniciar la conversación, y el cambio de edad cruza el umbral pediátrico.
  { id: 'correction-edad-pediatria', kind: 'correction', expectedSpecialty: 'pediatrics',
    messages: ['Tiene 14 años y le duele mucho la garganta.', 'Perdón, tiene 4 años, no 14.'] }
];
