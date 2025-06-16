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

// Función para obtener horarios disponibles
async function getAvailableSlots(date) { // <-- La fecha llega como 'YYYY-MM-DD'
  try {
    // <-- CAMBIO: Se valida y usa el formato 'YYYY-MM-DD' directamente.
    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
      console.error('Fecha inválida recibida en getAvailableSlots:', date);
      return [];
    }

    // La fecha ya está en el formato correcto, no es necesario convertirla.
    const startOfDay = moment(date).startOf('day').toISOString();
    const endOfDay = moment(date).endOf('day').toISOString();

    const response = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const dayOfWeek = moment(date).day();
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
async function createAppointment(date, time, patientName, patientPhone, email, service) { // <-- La fecha llega como 'YYYY-MM-DD'
  try {
    // <-- CAMBIO: Se combina la fecha 'YYYY-MM-DD' con la hora.
    const startTime = moment(`${date} ${time}`, 'YYYY-MM-DD HH:mm').toISOString();
    const endTime = moment(startTime).add(1, 'hour').toISOString();

    const event = {
      summary: `Cita ${service} - ${patientName}`,
      description: `Paciente: ${patientName}\nTeléfono: ${patientPhone}\nServicio: ${service}`,
      start: {
        dateTime: startTime,
        timeZone: 'America/Santiago', // ¡Excelente que especifiques la zona horaria!
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
const createServiceFlow = (keywords, serviceName) => {
  return addKeyword(keywords)
    .addAnswer(`Perfecto, vamos a agendar tu cita para *${serviceName}*.`)
    .addAnswer(MESSAGES.askFullName)
    .addAnswer({ capture: true }, async (ctx, { flowDynamic, state }) => {
      if (!isValidFullName(ctx.body)) {
        await flowDynamic(MESSAGES.invalidFullName);
        return fallback(MESSAGES.invalidFullName);
      }
      
      await state.update({ patientName: ctx.body, service: serviceName });
      await flowDynamic(MESSAGES.askPhoneNumber);
    })
    .addAnswer({capture: true}, async (ctx, { flowDynamic, state }) => {
      if (!isValidPhoneNumber(ctx.body)) {
        await flowDynamic(MESSAGES.invalidPhoneNumber)
        return fallback(MESSAGES.invalidPhoneNumber)
      }
      await state.update({ patientPhone: ctx.body });
      await flowDynamic('¿Deseas recibir un recordatorio por email? (opcional)\nResponde con tu email o escribe "no" para continuar')
    })
    .addAnswer({capture: true}, async (ctx, { flowDynamic, state }) => {
      const lowerBody = ctx.body.toLowerCase();
      if (lowerBody !== 'no' && !isValidEmail(lowerBody)) {
          await flowDynamic('Por favor, ingresa un email válido o escribe "no" para continuar');
          return fallback(MESSAGES.invalidEmail);
      }

      if (lowerBody !== 'no') {
        await state.update({ patientEmail: ctx.body });
      }

      // Se mantiene la lógica para mostrar las fechas disponibles
      return {
        body: MESSAGES.selectDate,
        list: [{
          title: 'Fechas Disponibles',
          body: 'elige una fecha para agendar tu hora',
          button: 'ver fechas',
          sections:[{
            title: '->',
            rows: getAvailableDates().map((date) => ({
              id: date.date, // El ID sigue siendo 'YYYY-MM-DD'
              title: `📅 ${date.display}`
            }))
          }]
         
        }]
      }
    })
    .addAnswer({capture: true}, async (ctx, { flowDynamic, state }) => {
      const selectedDate = ctx.body; // Formato: 'YYYY-MM-DD'
      if (!moment(selectedDate, 'YYYY-MM-DD', true).isValid()) { // Usamos 'true' para una validación estricta
        await flowDynamic('Por favor, selecciona una fecha válida del menú');
        return;
      }

      // Llamamos a getAvailableSlots con el formato completo
      const availableSlots = await getAvailableSlots(selectedDate);
      
      if (availableSlots.length === 0) {
        await flowDynamic(MESSAGES.noSlotsAvailable);
        return;
      }

      // <-- CAMBIO: Guardamos la fecha y los horarios en el estado para usarlos después
      await state.update({ selectedDate: selectedDate, availableSlots: availableSlots });
      
      const displayDate = moment(selectedDate, 'YYYY-MM-DD').format('DD/MM');

      return {
        body: MESSAGES.selectTime,
        list: {
          header: 'Horarios Disponibles',
          body: `Horarios para el ${displayDate}`, // Mostramos la fecha amigable
          button: 'Ver Horarios',
          sections: [{
            title: 'Turnos',
            rows: availableSlots.map((time) => ({
              id: time,
              title: `⏰ ${time}`
            }))
          }]
        }
      };
    })
    .addAnswer({capture: true}, async (ctx, { flowDynamic, state }) => {
      const selectedTime = ctx.body;
      const currentState = state.getMyState();
      
      // <-- CAMBIO: Reutilizamos los horarios desde el estado en lugar de llamar a la función de nuevo
      const availableSlots = currentState.availableSlots || [];
      
      if (!availableSlots.includes(selectedTime)) {
        await flowDynamic('Por favor, selecciona un horario válido del menú');
        return;
      }
      
      await state.update({ selectedTime });
      
      const appointment = await createAppointment(
        currentState.selectedDate, // Usamos la fecha completa guardada en el estado
        selectedTime,
        currentState.patientName,
        currentState.patientPhone,
        currentState.patientEmail || '',
        currentState.service
      );

      if (!appointment) {
        await flowDynamic(MESSAGES.appointmentError);
        return;
      }
      
      // Formateamos la fecha para mostrarla al usuario
      const displayDate = moment(currentState.selectedDate, 'YYYY-MM-DD').format('DD/MM');

      await flowDynamic(MESSAGES.appointmentConfirmed
        .replace('{date}', displayDate)
        .replace('{time}', selectedTime)
      );

      return {
        body: MESSAGES.needMore,
        buttons: [
          { body: '📅 Agendar otra cita' },
          { body: '❌ No, gracias' }
        ]
      };
    })
};
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
};


// Flujo para volver al inicio
const flowVolverInicio = addKeyword(['📅 Agendar otra cita', 'agendar', 'otra cita'])
  .addAnswer(MESSAGES.welcome, {
    buttons: [
      { body: '🦷 Odontología', id: '10' },
      { body: '🏃 Kinesiología', id: '20' }
    ]
  });


const flowOdontologia = createServiceFlow(['10', '🦷 Odontología'], 'Odontología');
const flowKinesiologia = createServiceFlow(['20', '🏃 Kinesiología'], 'Kinesiología');

// Flujo para despedida
const flowDespedida = addKeyword(['❌ No, gracias', 'no gracias', 'no, gracias', 'adios', 'adiós', 'chao', 'chau'])
  .addAnswer('¡Gracias por contactarnos! Que tengas un excelente día. 👋');

// Flujo para ubicación
const flowUbicacion = addKeyword(['50', 'ubicacion', 'direccion', 'dirección', 'donde', 'dónde', 'llegar', 'mapa'])
  .addAnswer(MESSAGES.location);
// Flujo para hablar con asesor
const flowAsesor = addKeyword(['30', 'asesor', 'humano', 'persona', 'contacto', 'llamar'])
  .addAnswer(MESSAGES.transferToHuman);

// Flujo para consultar precios
const flowPrecios = addKeyword(['40', 'precios', 'costo', 'valor'])
  .addAnswer(MESSAGES.prices);

// Flujo principal
const flowDefault = addKeyword(['agendar hora', 'agendar hora con dentista', 'agendar hora con kinesiologo'])
  .addAnswer(MESSAGES.welcome)
  .addAnswer({
    buttons: [
      { body: '🦷 Odontología' },
      { body: '🏃 Kinesiología' }
    ]
  });

const flowPrincipal = addKeyword(['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches'])
  .addAnswer(MESSAGES.welcome)
  .addAction(async (ctx, { provider }) => {
    const list = {
      header: {
        type: "text",
        text: "👋 ¡Hola! Bienvenido a Clínica Salud Total"
      },
      body: {
        text: "¿En qué servicio deseas agendar una cita?"
      },
      footer: {
        text: "Selecciona una opción para continuar"
      },
      action: {
        button: "Ver Servicios",
        sections: [
          {
            title: "🦷 Agendar Cita",
            rows: [
              { id: "10", title: "Odontología" },
              { id: "20", title: "Kinesiología" }
            ]
          },
          {
            title: "ℹ️ Más Información",
            rows: [
              { id: "30", title: "👨‍💼 Hablar con asesor" },
              { id: "40", title: "💰 Consultar precios" },
              { id: "50", title: "📍 Ver ubicación" }
            ]
          }
        ]
      }
    };
    await provider.sendList(ctx.from, list);
  });

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
    ]);
        
    const adapterProvider = createProvider(Provider, {
        jwtToken: process.env.JWT_TOKEN,
        numberId: process.env.NUMBER_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        version: 'v22.0'
    });
    const adapterDB = new Database();

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    // Configuración del webhook para verificación
    adapterProvider.server.get(
      '/webhook',
      handleCtx(async (bot, req, res) => {
        try {
          const mode = req.query['hub.mode'];
          const token = req.query['hub.verify_token'];
          const challenge = req.query['hub.challenge'];

          if (mode && token) {
            if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
              console.log('✅ Webhook verificado correctamente por Meta.');
              return res.status(200).send(challenge);
            } else {
              return res.status(403).end('Forbidden');
            }
          }
        } catch (error) {
          console.error('❌ Error verificando el token:', error);
          return res.status(500).end('error');
        }
      })
    );

    // Configuración del webhook para recibir mensajes
    adapterProvider.server.post(
      '/webhook',
      handleCtx(async (bot, req, res) => {
        try {
          const body = req.body;
          console.log('📲 Mensaje recibido en /webhook:', JSON.stringify(body, null, 2));

          if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0]) {
              const change = body.entry[0].changes[0];
              if (change.value.messages && change.value.messages[0]) {
                const message = change.value.messages[0];
                const from = message.from;
                const text = message.text?.body || '';

                console.log('📝 Procesando mensaje:', { from, text });
                await bot.processMessage({
                  from,
                  body: text
                });
              }
            }
            return res.status(200).send('EVENT_RECEIVED');
          }
          return res.status(404).end('Not found');
        } catch (error) {
          console.error('❌ Error procesando el mensaje:', error);
          return res.status(500).end('error');
        }
      })
    );

    // Endpoint para pruebas
    adapterProvider.server.post(
      '/v1/flow',
      handleCtx(async (bot, req, res) => {
        try {
          const { number } = req.body;
          await bot.dispatch('TEST', { from: number, name: 'bot' });
          return res.end('ok');
        } catch (error) {
          console.log(error);
          return res.end('error');
        }
      })
    );

    httpServer(+PORT);
    console.log(`🚀 Bot iniciado en el puerto ${PORT}`);
    console.log('🕒 Esperando mensajes de WhatsApp...');
};

main()
