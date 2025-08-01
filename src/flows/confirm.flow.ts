import { addKeyword, EVENTS } from "@builderbot/bot";
import { clearHistory, handleHistory, getHistoryParse } from "../utils/handlehistory";
import { getFullCurrentDate } from "../utils/currentDate";
import AIClass from "../services/ia";
import { appToCalendar } from "../services/calendar";

// Función para validar formato de teléfono chileno
const validateChileanPhone = (phone: string): boolean => {
    // Formato chileno: +56 9 XXXX XXXX o 9 XXXX XXXX o +569XXXXXXXX
    const phoneRegex = /^(\+56\s?)?(9\s?\d{4}\s?\d{4}|9\d{8})$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
};

// Función para formatear teléfono chileno
const formatChileanPhone = (phone: string): string => {
    // Remover espacios y caracteres especiales
    const cleanPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
    
    // Si no tiene +56, agregarlo
    if (!cleanPhone.startsWith('+56')) {
        return `+56${cleanPhone}`;
    }
    
    return cleanPhone;
};

const generatePromptToFormatDate = (history: string) => {
    const prompt = `Fecha de Hoy:${getFullCurrentDate()}, Basado en el Historial de conversacion: 
    ${history}
    ----------------
    Fecha ideal:...dd / mm hh:mm`

    return prompt
}

const generateJsonParse = (info: string) => {
    const prompt = `tu tarea principal es analizar la información proporcionada en el contexto y generar un objeto JSON que se adhiera a la estructura especificada a continuación. 

    Contexto: "${info}"
    
    {
        "startDate": "2024/02/15 00:00:00",    
        "name": "Leifer",
        "phone": "+56912345678",
        "interest": "n/a",
        "value": "0",
        "description": "n/a"
    }
    
    Objeto JSON a generar:`

    return prompt
}

/**
 * Encargado de pedir los datos necesarios para registrar el evento en el calendario
 */
const flowConfirm = addKeyword(EVENTS.ACTION).addAction(async (_, { flowDynamic }) => {
    await flowDynamic('Ok, voy a pedirte unos datos para agendar')
    await flowDynamic('¿Cual es tu nombre?')
}).addAction({ capture: true }, async (ctx, { state, flowDynamic, extensions }) => {
    await state.update({ name: ctx.body })
    const ai = extensions.ai as AIClass
    const history = getHistoryParse(state)
    const text = await ai.createChat([
        {
            role: 'system',
            content: generatePromptToFormatDate(history)
        }
    ], 'gpt-4')

    await handleHistory({ content: text, role: 'assistant' }, state)
    await flowDynamic(`¿Me confirmas fecha y hora?: ${text}`)
    await state.update({ startDate: text })
})
    .addAction({ capture: true }, async (ctx, { state, flowDynamic }) => {
        await flowDynamic(`¿Cual es tu número de teléfono? (formato chileno: +56 9 XXXX XXXX)`)
    })
    .addAction({ capture: true }, async (ctx, { state, flowDynamic }) => {
        const phone = ctx.body.trim();
        
        if (!validateChileanPhone(phone)) {
            await flowDynamic('Por favor, ingresa un número de teléfono válido en formato chileno. Ejemplo: +56 9 1234 5678 o 9 1234 5678');
            return;
        }
        
        const formattedPhone = formatChileanPhone(phone);
        await state.update({ phone: formattedPhone });
        await flowDynamic(`¿Cual es tu email?`)
    })
    .addAction({ capture: true }, async (ctx, { state, extensions, flowDynamic }) => {
        const infoCustomer = `Name: ${state.get('name')}, StarteDate: ${state.get('startDate')}, email: ${ctx.body}, phone: ${state.get('phone')}`
        const ai = extensions.ai as AIClass

        const text = await ai.createChat([
            {
                role: 'system',
                content: generateJsonParse(infoCustomer)
            }
        ])

        try {
            const parsedData = JSON.parse(text);
            await appToCalendar(parsedData);
            clearHistory(state);
            await flowDynamic('Listo! agendado Buen dia');
        } catch (error) {
            console.error('Error parsing JSON or adding to calendar:', error);
            await flowDynamic('Hubo un error al procesar tu solicitud. Por favor, intenta nuevamente.');
        }
    })

export { flowConfirm }