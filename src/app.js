import { createBot, createProvider, createFlow, addKeyword } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { MetaProvider as Provider } from '@builderbot/provider-meta'
import { google } from 'googleapis'
import moment from 'moment'
const PORT = process.env.PORT ?? 3008


const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/calendar']
)
const calendar = google.calendar({ version: 'v3', auth: auth });

// Función para obtener horarios disponibles

const WORKING_HOURS_CONFIG = {
  0: ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'], // Domingo
  6: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'], // Sábado
  default: [ // Lunes a Viernes
    '08:00', '09:00', '10:00', '11:00', '12:00', '14:00', 
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
  ]
};

async function getAvailableSlots(date) {
  try {
    if (!moment(date, 'DD/MM').isValid()) {
      console.error('Fecha inválida:', date);
      return [];
    }

    const formattedDate = moment(date, 'DD/MM').format('YYYY-MM-DD');
    const startOfDay = moment(formattedDate).startOf('day').toISOString();
    const endOfDay = moment(formattedDate).endOf('day').toISOString();

    const response = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: true,
      orderBy: 'startTime'
    });
          const dayOfWeek = moment(formattedDate).day();
          // CORRECCIÓN: Asignar directamente el array, sin meterlo en otro.
          const workingHours = WORKING_HOURS_CONFIG[dayOfWeek] || WORKING_HOURS_CONFIG.default;
 
          const busySlots = response.data.items.map(event => {
            const start = moment(event.start.dateTime);
            return start.format('HH:mm');
          });
      
          return workingHours.filter(hour => !busySlots.includes(hour));
        } catch (error) {
          console.error('Error al obtener horarios disponibles:', error);
          return [];
        }
    }

     
  
    

  
// Función para validar nombre completo
function isValidFullName(name) {
  return name.trim().split(' ').length >= 2
}
  
// Función para validar número de teléfono
function isValidPhoneNumber(phone) {
  return /^\+?[0-9]{8,12}$/.test(phone.replace(/\s+/g, ''))
}
  
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
  
// Función para CREAR un evento en Google Calendar
async function createAppointment(date, time, patientName, patientPhone, email, service) {
  try {
    const formattedDate = moment(date, 'DD/MM').format('YYYY-MM-DD');
    const startTime = moment(`${formattedDate} ${time}`, 'YYYY-MM-DD HH:mm').toISOString();
    const endTime = moment(startTime).add(1, 'hour').toISOString(); // Cambiado a 1 hora, ajusta si es necesario

    const event = {
      summary: `Cita ${service} - ${patientName}`,
      description: `Paciente: ${patientName}\nTeléfono: ${patientPhone}\nServicio: ${service}`,
      start: {
        dateTime: startTime,
        timeZone: 'America/Santiago',
      },
      end: {
        dateTime: endTime,
        timeZone: 'America/Santiago',
      },
      attendees: email ? [{ email: email }] : [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 60 },
        ],
      },
    };
  
    // CORRECCIÓN: Añadido "await" aquí. ¡Esto es crucial!
    const response = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      resource: event,
    });

    return response.data;
  } catch (error) {
    console.error('Error al crear la cita:', error);
    return null;
  }
}

// Función para generar fechas disponibles (próximos 14 días)
function getAvailableDates() {
  const dates = []
  for (let i = 1; i <= 14; i++) {
    const date = moment().add(i, 'days')
    dates.push({
      date: date.format('YYYY-MM-DD'),
      display: date.format('dddd DD/MM')
    })
  }
  return dates
}

// Mensajes del bot
const MESSAGES = {
  welcome: '👋 ¡Hola! Bienvenido a *Clínica Salud Total*.\n\n¿En qué servicio deseas agendar una cita?',
  error: 'Lo siento, ha ocurrido un error. Por favor, intenta nuevamente más tarde.',
  invalidOption: 'Por favor, selecciona una opción válida del menú.',
  selectDate: 'Por favor, selecciona una fecha para tu cita:',
  selectTime: 'Por favor, selecciona un horario disponible:',
  confirmAppointment: '¿Confirmas tu cita para el {date} a las {time}?',
  appointmentConfirmed: '¡Perfecto! Tu cita ha sido agendada para el {date} a las {time}.\n\nRecuerda llegar 10 minutos antes de tu hora agendada.',
  appointmentCancelled: 'Entendido. Si deseas agendar en otro momento, no dudes en contactarnos.',
  needMore: '¿Necesitas algo más?',
  noSlotsAvailable: 'Lo siento, no hay horarios disponibles para esta fecha. Por favor, selecciona otra fecha.',
  askFullName: 'Por favor, ingresa tu nombre completo:',
  invalidFullName: 'Por favor, ingresa tu nombre y apellido completos.',
  askPhoneNumber: 'Por favor, ingresa tu número de teléfono:',
  invalidPhoneNumber: 'Por favor, ingresa un número de teléfono válido (8-12 dígitos).',
  appointmentError: 'Lo siento, hubo un error al agendar tu cita. Por favor, intenta nuevamente.',
  defaultMessage: 'Entiendo que necesitas ayuda personalizada. En breve uno de nuestros asistentes te atenderá. Por favor, describe brevemente lo que necesitas.',
  transferToHuman: 'Para una consulta personalizada, puedes contactarnos directamente al:\n\n' +
    '📱 *+56912345678*\n\n' +
    'Nuestro equipo te atenderá de lunes a viernes de 9:00 a 21:00 y sábados de 9:00 a 14:00.',
  location: '📍 *Ubicación de Clínica Salud Total*\n\n' +
    '🏥 Dirección: Av. Principal #123, Santiago\n' +
    '🚇 Metro más cercano: Estación Central (Línea 1)\n' +
    '🚌 Buses: 101, 102, 103\n\n' +
    '🗺️ *Cómo llegar:*\n' +
    '1. Desde Metro Estación Central: 5 minutos caminando\n' +
    '2. Desde Terminal de Buses: 10 minutos caminando\n' +
    '3. En auto: Estacionamiento disponible\n\n' +
    '⏰ *Horario de atención:*\n' +
    'Lunes a Viernes: 8:00 - 21:00\n' +
    'Sábados: 9:00 - 14:00\n' +
    'Domingos: Cerrado\n\n' +
    '🌐 *Google Maps:*\n' +
    'https://maps.google.com/?q=-33.4489,-70.6693\n\n' +
    '¿Necesitas más información?',
  menuOptions: '¿En qué puedo ayudarte?\n\n' +
    '1️⃣ Para agendar una cita\n' +
    '2️⃣ Para hablar con un asesor\n' +
    '3️⃣ Para consultar precios\n' +
    '4️⃣ Para ver ubicación\n' +
    '5️⃣ Para otra consulta',
  prices: '💰 *Información sobre precios*\n\n' +
    'Los precios varían de acuerdo al tratamiento y la complejidad. ' +
    'Para obtener un presupuesto preciso, es necesario que sea evaluado con la doctora Patricia reyes.\n\n' +
    '¿Deseas agendar una evaluación?'
}


// Flujo para volver al inicio
const flowVolverInicio = addKeyword(['📅 Agendar otra cita', 'agendar', 'otra cita'])
  .addAnswer(MESSAGES.welcome, {
    buttons: [
      { body: '🦷 Odontología' },
      { body: '🏃 Kinesiología' }
    ]
  })

const createServiceFlow = (keywords, serviceName) => {
  return addKeyword(keywords)
    .addAnswer(`Perfecto, vamos a agendar tu cita para *${serviceName}*.`)
    .addAnswer(MESSAGES.askFullName)
    .addAnswer({ capture: true }, async (ctx, { flowDynamic, state }) => {
      if (!isValidFullName(ctx.body)) {
        await flowDynamic(MESSAGES.invalidFullName);
        return;
      }
      
      await state.update({ patientName: ctx.body, service: serviceName });
      await flowDynamic(MESSAGES.askPhoneNumber);
    })
    .addAnswer({capture: true}, async (ctx, { flowDynamic, state }) => {
      if (!isValidPhoneNumber(ctx.body)) {
        await flowDynamic(MESSAGES.invalidPhoneNumber)
        return
      }
      await state.update({ patientPhone: ctx.body });
      await flowDynamic('¿Deseas recibir un recordatorio por email? (opcional)\nResponde con tu email o escribe "no" para continuar')
    })
    .addAnswer({capture: true}, async (ctx, { flowDynamic, state }) => {
      if (ctx.body.toLowerCase() !== 'no') {
        if (!isValidEmail(ctx.body)) {
          await flowDynamic('Por favor, ingresa un email válido o escribe "no" para continuar')
          return
        }
        await state.update({ patientEmail: ctx.body });
      }
      return {
        body: MESSAGES.selectDate,
        buttons: getAvailableDates().map((date) => ({
          body: `📅 ${date.display}`
        }))
      }
    })
    .addAnswer({capture: true}, async (ctx, { flowDynamic, state }) => {
      const selectedDate = ctx.body.split(' ')[1];
      if (!moment(selectedDate, 'DD/MM').isValid()) {
        await flowDynamic('Por favor, selecciona una fecha válida')
        return
      }
      await state.update({ selectedDate });
      const availableSlots = await getAvailableSlots(selectedDate);
      
      if (availableSlots.length === 0) {
        await flowDynamic(MESSAGES.noSlotsAvailable)
        return
      }

      return {
        body: MESSAGES.selectTime,
        buttons: availableSlots.map((time) => ({
          body: `⏰ ${time}`
        }))
      }
    })
    .addAnswer({capture: true}, async (ctx, { flowDynamic, state }) => {
      const selectedTime = ctx.body.split(' ')[1];
      if (!selectedTime) {
        await flowDynamic('Por favor, selecciona un horario válido')
        return
      }
      await state.update({ selectedTime });
      
      const appointment = await createAppointment(
        state.get('selectedDate'),
        selectedTime,
        state.get('patientName'),
        state.get('patientPhone'),
        state.get('patientEmail') || '',
        state.get('service')
      );

      if (!appointment) {
        await flowDynamic(MESSAGES.appointmentError)
        return
      }

      await flowDynamic(MESSAGES.appointmentConfirmed
        .replace('{date}', moment(state.get('selectedDate'), 'DD/MM').format('DD/MM/YYYY'))
        .replace('{time}', selectedTime)
      )

      return {
        body: MESSAGES.needMore,
        buttons: [
          { body: '📅 Agendar otra cita' },
          { body: '❌ No, gracias' }
        ]
      }
    })
}

const flowOdontologia = createServiceFlow(['🦷 Odontología', 'odontologia'], 'Odontología');
const flowKinesiologia = createServiceFlow(['🏃 Kinesiología', 'kinesiologia'], 'Kinesiología');

// Flujo para despedida
const flowDespedida = addKeyword(['❌ No, gracias', 'no gracias', 'no, gracias', 'adios', 'adiós', 'chao', 'chau'])
  .addAnswer('¡Gracias por contactarnos! Que tengas un excelente día. 👋')

// Flujo para ubicación
const flowUbicacion = addKeyword(['📍 Ubicación', 'ubicacion', 'direccion', 'dirección', 'donde', 'dónde', 'llegar', 'mapa'])
  .addAnswer(MESSAGES.location, {
    buttons: [
      { body: '🦷 Odontología' },
      { body: '🏃 Kinesiología' },
      { body: '👨‍💼 Hablar con asesor' }    ]
  })

// Flujo para hablar con asesor
const flowAsesor = addKeyword(['👨‍💼 Hablar con asesor', 'asesor', 'humano', 'persona', 'contacto', 'llamar'])
  .addAnswer(MESSAGES.transferToHuman, {
    buttons: [
      { body: '🦷 Odontología' },
      { body: '🏃 Kinesiología' },
      { body: '💰 Consultar precios' }    ]
  })

// Flujo para consultar precios
const flowPrecios = addKeyword(['💰 Consultar precios', 'precios', 'costo', 'valor'])
  .addAnswer(MESSAGES.prices, {
    buttons: [
      { body: '🦷 Odontología' },
      { body: '🏃 Kinesiología' },
      { body: '👨‍💼 Hablar con asesor' }
    ]
  })

// Flujo principal
const flowPrincipal = addKeyword(['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'menu', 'menú', 'inicio'])
  .addAnswer(MESSAGES.welcome, {
    buttons: [
      { body: '🦷 Odontología' },
      { body: '🏃 Kinesiología' }
      
    ]
  })

// Flujo por defecto para mensajes no programados
const flowDefault = addKeyword([''])
  .addAnswer(MESSAGES.defaultMessage)
  .addAnswer(MESSAGES.menuOptions, {
    buttons: [
      { body: '🦷 Odontología' },
      { body: '🏃 Kinesiología' },
      { body: '👨‍💼 Hablar con asesor' },
      { body: '💰 Consultar precios' },
      { body: '📍 Ubicación' }
    ]
  })

const main = async () => {
    const adapterFlow = createFlow([
        flowPrincipal,
        flowOdontologia,
        flowKinesiologia,
        flowVolverInicio,
        flowDespedida,
        flowUbicacion,
        flowAsesor,
        flowPrecios,
        flowDefault
    ])
        
    const adapterProvider = createProvider(Provider, {
        jwtToken: process.env.JWT_TOKEN,
        numberId: process.env.NUMBER_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        version: 'v22.0'
    })
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message } = req.body;
            if (message) {
                await bot.flowDynamic(number, message);
            }
            res.end('ok');
        })
    )

    httpServer(+PORT)
    console.log(`Bot iniciado en el puerto ${PORT}`);
}

main()
