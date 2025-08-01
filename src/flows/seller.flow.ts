import { addKeyword, EVENTS } from "@builderbot/bot";
import { generateTimer } from "../utils/generateTimer";
import { getHistoryParse, handleHistory } from "../utils/handlehistory";
import AIClass from "../services/ia";
import { getFullCurrentDate } from "../utils/currentDate";

const PROMPT_SELLER = `Eres el asistente virtual en la clinica "tu salud", ubicada en cañete, Plaza de Castilla 4A. Tu principal responsabilidad es responder a las consultas de los clientes y ayudarles a programar sus citas.

FECHA DE HOY: {CURRENT_DAY}

SOBRE "clinica tu salud":
Nos distinguimos por ofrecer una atencion comoda y profesional para los clientes. Nuestro horario de atención es de lunes a viernes, desde las 09:00 hasta las 17:00. Para más información, visita nuestro sitio web en "barberflow.co". Aceptamos pagos en efectivo y a través de PayPal. Recuerda que es necesario programar una cita.



HISTORIAL DE CONVERSACIÓN:
--------------
{HISTORIAL_CONVERSACION}
--------------

DIRECTRICES DE INTERACCIÓN:
1. Anima a los clientes a llegar 5 minutos antes de su cita para asegurar su turno.
2. Evita sugerir modificaciones en los servicios, añadir extras o ofrecer descuentos.
3. Siempre reconfirma el servicio solicitado por el cliente antes de programar la cita para asegurar su satisfacción.


EJEMPLOS DE RESPUESTAS:
"Claro, ¿cómo puedo ayudarte a programar tu cita?"
"Recuerda que debes agendar tu cita..."
"como puedo ayudarte..."

INSTRUCCIONES:
- NO saludes
- Respuestas cortas ideales para enviar por whatsapp con emojis

Respuesta útil:`;


export const generatePromptSeller = (history: string) => {
    const nowDate = getFullCurrentDate()
    return PROMPT_SELLER.replace('{HISTORIAL_CONVERSACION}', history).replace('{CURRENT_DAY}', nowDate)
};

/**
 * Hablamos con el PROMPT que sabe sobre las cosas basicas del negocio, info, precio, etc.
 */
const flowSeller = addKeyword(EVENTS.ACTION).addAction(async (_, { state, flowDynamic, extensions }) => {
    try {
        const ai = extensions.ai as AIClass
        const history = getHistoryParse(state)
        const prompt = generatePromptSeller(history)

        const text = await ai.createChat([
            {
                role: 'system',
                content: prompt
            }
        ])

        await handleHistory({ content: text, role: 'assistant' }, state)

        const chunks = text.split(/(?<!\d)\.\s+/g);
        for (const chunk of chunks) {
            await flowDynamic([{ body: chunk.trim(), delay: generateTimer(150, 250) }]);
        }
    } catch (err) {
        console.log(`[ERROR]:`, err)
        return
    }
})

export { flowSeller }